import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type {
  BoardCardSummary,
  BoardInfo,
  TeamMember,
  TeamSyncSettings,
  ITrelloContext,
} from '../../types/teamsync';
import { subscribeToTeamSyncUpdates } from '../../trello/trelloBridge';
import {
  DEFAULT_SETTINGS,
  computeDashboardMetrics,
  formatCardDeadline,
  formatExactTimeAgo,
  formatRelativeSyncTime,
  // generateRealtimeAiSummary,
  getCardDeadlineTimestamp,
  getCardHandoffDisplay,
  getCardLifecycleStatus,
  getCardPriority,
  getMemberColor,
  getMemberInitials,
  isCardCompleted,
  isCardOverdue,
  matchesDeadlineFilter,
} from '../../utils/statusUtils';
import {
  buildAcceptHandoffData,
  buildCancelHandoffData,
  buildDeclineHandoffData,
  buildEscalationData,
} from '../../utils/handoffActions';
import { SettingsPanel } from './SettingsPanel';
import { CardInspectorModal } from './CardInspectorModal';
import { PendingActionsPanel, type PendingScope } from './PendingActionsPanel';
import { HistoryFeedPanel } from './HistoryFeedPanel';

interface TeamSyncDashboardProps {
  context: ITrelloContext;
  onResetDemoData?: () => void;
  onDataSynced?: () => void;
}

type SortField = 'name' | 'owner' | 'deadline' | 'status' | 'handoff';

export const TeamSyncDashboard: React.FC<TeamSyncDashboardProps> = ({
  context,
  onResetDemoData,
  onDataSynced,
}) => {
  const [cards, setCards] = useState<BoardCardSummary[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [currentMember, setCurrentMember] = useState<TeamMember | null>(null);
  const [boardInfo, setBoardInfo] = useState<BoardInfo>({
    id: 'board',
    name: 'Product Sprint',
    isConnected: true,
    memberCount: 0,
    lastSyncedAt: new Date().toISOString(),
  });
  const [settings, setSettings] = useState<TeamSyncSettings>(DEFAULT_SETTINGS);

  const [loading, setLoading] = useState(true);
  const [activeNav, setActiveNav] = useState<'dashboard' | 'settings'>('dashboard');
  const [activeTab, setActiveTab] = useState<'task' | 'pending' | 'member' | 'history'>('task');
  const [pendingScope, setPendingScope] = useState<PendingScope>('all');

  const [selectedMember, setSelectedMember] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedPriority, setSelectedPriority] = useState<string>('all');
  const [selectedDeadline, setSelectedDeadline] = useState<string>('all');
  const [onlyPendingHandoffs, setOnlyPendingHandoffs] = useState(false);
  const [onlyPendingTasks, setOnlyPendingTasks] = useState(false);
  const [search, setSearch] = useState<string>('');

  const [sortField, setSortField] = useState<SortField>('deadline');
  const [sortAsc, setSortAsc] = useState(true);

  const [isRefreshing, setIsRefreshing] = useState(false);
  // const [isRegeneratingAi, setIsRegeneratingAi] = useState(false);
  // const [aiVariant, setAiVariant] = useState(0);
  // const [aiGeneratedAt, setAiGeneratedAt] = useState<string>(new Date().toISOString());
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);
  const [inspectedCardId, setInspectedCardId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const autoEscalatedKeysRef = useRef<Set<string>>(new Set());
  const managerAlertedIdsRef = useRef<Set<string>>(new Set());

  const fetchBoardSnapshot = useCallback(async () => {
    const [boardCards, memberList, current, info, loadedSettings] = await Promise.all([
      context.getBoardCards ? context.getBoardCards() : Promise.resolve([]),
      context.getMembers(),
      context.getCurrentMember().catch(() => null),
      context.getBoardInfo
        ? context.getBoardInfo()
        : Promise.resolve({
            id: 'board',
            name: 'Product Sprint',
            isConnected: true,
            memberCount: 0,
            lastSyncedAt: new Date().toISOString(),
          }),
      context.getSettings ? context.getSettings() : Promise.resolve(DEFAULT_SETTINGS),
    ]);

    const escalationContactMember = loadedSettings.escalationContactId
      ? memberList.find((m) => m.id === loadedSettings.escalationContactId) || null
      : null;

    const processedCards = boardCards.map((card) => {
      if (card.data.handoff?.status !== 'pending') return card;
      const syncKey = `${card.id}:${card.data.handoff.id}:${escalationContactMember?.id || 'none'}`;
      if (autoEscalatedKeysRef.current.has(syncKey)) return card;

      const { nextData, didChange } = buildEscalationData(
        card.data,
        loadedSettings.escalationThresholdHours,
        escalationContactMember,
        null
      );

      if (didChange) {
        autoEscalatedKeysRef.current.add(syncKey);
        context.setCardData(nextData, card.id).catch((err) => {
          console.warn('Failed to persist auto-escalation state for card', card.id, err);
        });
        return { ...card, data: nextData };
      }

      return card;
    });

    if (escalationContactMember && current?.id === escalationContactMember.id) {
      const newlyAlerted = processedCards.filter((card) => {
        const ho = card.data.handoff;
        if (!ho || ho.status !== 'pending' || !ho.escalatedAt || ho.escalationAcknowledgedAt) {
          return false;
        }
        return !managerAlertedIdsRef.current.has(ho.id);
      });

      if (newlyAlerted.length > 0) {
        for (const c of newlyAlerted) {
          if (c.data.handoff) managerAlertedIdsRef.current.add(c.data.handoff.id);
        }
        context.notify?.(
          newlyAlerted.length === 1
            ? `Escalation Alert: "${newlyAlerted[0].name}" handoff exceeded ${loadedSettings.escalationThresholdHours}h`
            : `Escalation Alert: ${newlyAlerted.length} handoffs exceeded ${loadedSettings.escalationThresholdHours}h threshold`
        );
      }
    }

    return {
      boardCards: processedCards,
      memberList,
      current,
      info: {
        ...info,
        lastSyncedAt: new Date().toISOString(),
      },
      loadedSettings,
    };
  }, [context]);

  const loadData = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setIsRefreshing(true);
      }
      try {
        const snapshot = await fetchBoardSnapshot();
        setCards(snapshot.boardCards);
        setMembers(snapshot.memberList);
        setCurrentMember(snapshot.current);
        setBoardInfo(snapshot.info);
        setSettings(snapshot.loadedSettings);
        setNowMs(Date.now());
        onDataSynced?.();
      } catch (e) {
        console.error('Failed to load dashboard data', e);
        setBoardInfo((prev) => ({ ...prev, isConnected: false }));
      } finally {
        setLoading(false);
        if (!options?.silent) {
          setIsRefreshing(false);
        }
      }
    },
    [fetchBoardSnapshot, onDataSynced]
  );

  // Initial load + focus & cross-tab real-time sync listeners
  useEffect(() => {
    let active = true;

    fetchBoardSnapshot()
      .then((snapshot) => {
        if (!active) return;
        setCards(snapshot.boardCards);
        setMembers(snapshot.memberList);
        setCurrentMember(snapshot.current);
        setBoardInfo(snapshot.info);
        setSettings(snapshot.loadedSettings);
        setNowMs(Date.now());
        onDataSynced?.();
      })
      .catch((e) => {
        console.error('Failed to load dashboard data', e);
        if (active) {
          setBoardInfo((prev) => ({ ...prev, isConnected: false }));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const unsubscribe = subscribeToTeamSyncUpdates(() => {
      loadData({ silent: true });
    });

    const handleFocus = () => {
      loadData({ silent: true });
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener('focus', handleFocus);
    };
  }, [fetchBoardSnapshot, loadData, onDataSynced]);

  // Real-time auto-refresh polling based on configured interval
  useEffect(() => {
    if (!settings.autoRefreshSeconds || settings.autoRefreshSeconds <= 0) return;

    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadData({ silent: true });
      }
    }, settings.autoRefreshSeconds * 1000);

    return () => window.clearInterval(timer);
  }, [settings.autoRefreshSeconds, loadData]);

  // Live relative clock tick for "Generated X ago" & elapsed handoff timers
  useEffect(() => {
    const tick = window.setInterval(() => {
      setNowMs(Date.now());
    }, 15000);
    return () => window.clearInterval(tick);
  }, []);

  // Merge board members with any card owners not returned by board.members
  const allKnownMembers = useMemo(() => {
    const map = new Map<string, TeamMember>();
    for (const m of members) {
      map.set(m.id, { ...m, initials: m.initials || getMemberInitials(m.fullName) });
    }
    for (const c of cards) {
      if (c.data.owner && !map.has(c.data.owner.id)) {
        map.set(c.data.owner.id, {
          id: c.data.owner.id,
          fullName: c.data.owner.fullName,
          username: c.data.owner.username,
          avatarUrl: c.data.owner.avatarUrl,
          initials: c.data.owner.initials || getMemberInitials(c.data.owner.fullName),
        });
      }
    }
    return Array.from(map.values());
  }, [members, cards]);

  const escalationContact = useMemo(() => {
    if (!settings.escalationContactId) return null;
    return allKnownMembers.find((m) => m.id === settings.escalationContactId) || null;
  }, [allKnownMembers, settings.escalationContactId]);

  // Live Dashboard Metrics + Health Score
  const metrics = useMemo(() => computeDashboardMetrics(cards, settings), [cards, settings]);

  const escalatedPendingCards = useMemo(() => {
    return cards.filter((c) => {
      if (c.data.handoff?.status !== 'pending') return false;
      const createdTs = c.data.handoff.createdAt ? new Date(c.data.handoff.createdAt).getTime() : nowMs;
      const hours = !Number.isNaN(createdTs) ? Math.max(0, (nowMs - createdTs) / (1000 * 60 * 60)) : 0;
      return hours >= settings.escalationThresholdHours;
    });
  }, [cards, settings.escalationThresholdHours, nowMs]);

  const unacknowledgedEscalations = useMemo(
    () => escalatedPendingCards.filter((c) => !c.data.handoff?.escalationAcknowledgedAt),
    [escalatedPendingCards]
  );

  const myPendingCount = useMemo(() => {
    if (!currentMember) return 0;
    return cards.filter(
      (c) => c.data.handoff?.status === 'pending' && c.data.handoff.toMember.id === currentMember.id
    ).length;
  }, [cards, currentMember]);

  const totalHistoryCount = useMemo(() => {
    let total = 0;
    for (const c of cards) {
      total += c.data.history?.length || 0;
    }
    return total;
  }, [cards]);

  // Live AI Summary bullets
  // const aiBullets = useMemo(
  //   () => generateRealtimeAiSummary(cards, allKnownMembers, metrics, settings, aiVariant),
  //   [cards, allKnownMembers, metrics, settings, aiVariant]
  // );

  // Filtered Cards
  const filteredCards = useMemo(() => {
    return cards.filter((card) => {
      if (selectedMember === 'unassigned') {
        if (card.data.owner) return false;
      } else if (selectedMember !== 'all') {
        const isOwner = card.data.owner?.id === selectedMember;
        const isRecipient =
          card.data.handoff?.status === 'pending' && card.data.handoff.toMember.id === selectedMember;
        if (!isOwner && !isRecipient) return false;
      }

      if (onlyPendingHandoffs && card.data.handoff?.status !== 'pending') {
        return false;
      }

      if (onlyPendingTasks && isCardCompleted(card)) {
        return false;
      }

      if (selectedStatus !== 'all') {
        if (selectedStatus === 'Needs Owner') {
          if (card.data.owner || isCardCompleted(card)) return false;
        } else if (selectedStatus === 'Escalated') {
          const ho = getCardHandoffDisplay(card, settings.escalationThresholdHours, escalationContact?.fullName, nowMs);
          if (ho.state !== 'escalated') return false;
        } else {
          const liveStatus = getCardLifecycleStatus(card);
          if (liveStatus.toLowerCase() !== selectedStatus.toLowerCase()) return false;
        }
      }

      if (selectedPriority !== 'all') {
        if (getCardPriority(card).toLowerCase() !== selectedPriority.toLowerCase()) return false;
      }

      if (!matchesDeadlineFilter(card, selectedDeadline)) {
        return false;
      }

      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = card.name.toLowerCase().includes(q);
        const matchList = card.listName.toLowerCase().includes(q);
        const matchOwner = card.data.owner?.fullName.toLowerCase().includes(q) || false;
        const matchHandoff = card.data.handoff?.toMember.fullName.toLowerCase().includes(q) || false;
        if (!matchName && !matchList && !matchOwner && !matchHandoff) return false;
      }

      return true;
    });
  }, [
    cards,
    selectedMember,
    onlyPendingHandoffs,
    onlyPendingTasks,
    selectedStatus,
    selectedPriority,
    selectedDeadline,
    search,
    settings.escalationThresholdHours,
    escalationContact,
    nowMs,
  ]);

  // Sorted Cards
  const sortedCards = useMemo(() => {
    const statusOrder: Record<string, number> = {
      Overdue: 0,
      'In Progress': 1,
      'To Do': 2,
      Done: 3,
    };
    const handoffOrder: Record<string, number> = {
      escalated: 0,
      pending: 1,
      declined: 2,
      in_progress: 3,
      not_started: 4,
      completed: 5,
    };

    return [...filteredCards].sort((a, b) => {
      let comp = 0;
      if (sortField === 'name') {
        comp = a.name.localeCompare(b.name);
      } else if (sortField === 'owner') {
        comp = (a.data.owner?.fullName || 'zzz').localeCompare(b.data.owner?.fullName || 'zzz');
      } else if (sortField === 'deadline') {
        comp = getCardDeadlineTimestamp(a) - getCardDeadlineTimestamp(b);
      } else if (sortField === 'status') {
        const sa = statusOrder[getCardLifecycleStatus(a)] ?? 9;
        const sb = statusOrder[getCardLifecycleStatus(b)] ?? 9;
        comp = sa - sb;
      } else if (sortField === 'handoff') {
        const ha = getCardHandoffDisplay(a, settings.escalationThresholdHours).state;
        const hb = getCardHandoffDisplay(b, settings.escalationThresholdHours).state;
        comp = (handoffOrder[ha] ?? 9) - (handoffOrder[hb] ?? 9);
      }
      return sortAsc ? comp : -comp;
    });
  }, [filteredCards, sortField, sortAsc, settings.escalationThresholdHours]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const hasActiveFilters =
    selectedMember !== 'all' ||
    selectedStatus !== 'all' ||
    selectedPriority !== 'all' ||
    selectedDeadline !== 'all' ||
    onlyPendingHandoffs ||
    onlyPendingTasks ||
    search.trim().length > 0;

  const clearAllFilters = () => {
    setSelectedMember('all');
    setSelectedStatus('all');
    setSelectedPriority('all');
    setSelectedDeadline('all');
    setOnlyPendingHandoffs(false);
    setOnlyPendingTasks(false);
    setPendingScope('all');
    setSearch('');
  };

  const handleInlineAcceptHandoff = async (card: BoardCardSummary) => {
    const nextData = buildAcceptHandoffData(card.data, currentMember);
    if (!nextData) return;
    await context.setCardData(nextData, card.id);
    context.notify?.(`Handoff accepted for "${card.name}". Primary ownership transferred.`);
    await loadData({ silent: true });
  };

  const handleInlineDeclineHandoff = async (card: BoardCardSummary, reason: string) => {
    const nextData = buildDeclineHandoffData(card.data, reason, currentMember);
    if (!nextData) return;
    await context.setCardData(nextData, card.id);
    context.notify?.(`Handoff declined for "${card.name}". Ownership stays with ${card.data.handoff?.fromMember.fullName}.`);
    await loadData({ silent: true });
  };

  const handleInlineCancelHandoff = async (card: BoardCardSummary) => {
    const nextData = buildCancelHandoffData(card.data, currentMember);
    if (!nextData) return;
    await context.setCardData(nextData, card.id);
    context.notify?.(`Pending handoff cancelled for "${card.name}".`);
    await loadData({ silent: true });
  };

  const handleInlineNotifyEscalation = async (card: BoardCardSummary) => {
    const { nextData, didChange } = buildEscalationData(
      card.data,
      settings.escalationThresholdHours,
      escalationContact,
      currentMember,
      { forceRenotify: true }
    );
    if (!didChange) return;
    await context.setCardData(nextData, card.id);
    context.notify?.(
      escalationContact
        ? `Escalation alert sent to ${escalationContact.fullName} for "${card.name}"`
        : `Escalation flagged for "${card.name}"`
    );
    await loadData({ silent: true });
  };

  const handleInlineAcknowledgeEscalation = async (card: BoardCardSummary) => {
    const { nextData, didChange } = buildEscalationData(
      card.data,
      settings.escalationThresholdHours,
      escalationContact,
      currentMember,
      { acknowledge: true }
    );
    if (!didChange) return;
    await context.setCardData(nextData, card.id);
    context.notify?.(`Escalation alert acknowledged for "${card.name}".`);
    await loadData({ silent: true });
  };

  const handleAcknowledgeAllEscalations = async () => {
    for (const card of unacknowledgedEscalations) {
      const { nextData, didChange } = buildEscalationData(
        card.data,
        settings.escalationThresholdHours,
        escalationContact,
        currentMember,
        { acknowledge: true }
      );
      if (didChange) {
        await context.setCardData(nextData, card.id);
      }
    }
    context.notify?.('Escalation alerts acknowledged. Owners remain accountable until handoffs are accepted.');
    await loadData({ silent: true });
  };

  const handleExportCSV = () => {
    const headers = ['Task', 'List', 'Owner', 'Priority', 'Deadline', 'Status', 'Handoff', 'Handoff Target'];
    const escapeCsv = (val: string) => `"${String(val).replace(/"/g, '""')}"`;

    const exportSource = sortedCards.length > 0 ? sortedCards : cards;
    const rows = exportSource.map((c) => {
      const ho = getCardHandoffDisplay(c, settings.escalationThresholdHours);
      return [
        escapeCsv(c.name),
        escapeCsv(c.listName),
        escapeCsv(c.data.owner?.fullName || 'Unassigned'),
        escapeCsv(getCardPriority(c)),
        escapeCsv(formatCardDeadline(c)),
        escapeCsv(getCardLifecycleStatus(c)),
        escapeCsv(ho.label),
        escapeCsv(c.data.handoff?.status === 'pending' ? c.data.handoff.toMember.fullName : ''),
      ];
    });

    const csvString = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeBoard = boardInfo.name.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'Board';
    link.href = url;
    link.download = `TeamSync_${safeBoard}_Report.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setExportFeedback(`Exported ${exportSource.length} tasks`);
    setTimeout(() => setExportFeedback(null), 2500);
  };

  // const handleRegenerate = async () => {
  //   setIsRegeneratingAi(true);
  //   await loadData({ silent: true });
  //   setTimeout(() => {
  //     setAiVariant((v) => v + 1);
  //     setAiGeneratedAt(new Date().toISOString());
  //     setIsRegeneratingAi(false);
  //   }, 350);
  // };

  const handleSaveSettings = async (next: TeamSyncSettings) => {
    if (context.saveSettings) {
      await context.saveSettings(next);
    }
    setSettings(next);
    await loadData({ silent: true });
  };

  const inspectedCard = useMemo(
    () => (inspectedCardId ? cards.find((c) => c.id === inspectedCardId) || null : null),
    [cards, inspectedCardId]
  );

  const renderMemberAvatar = (
    member: { fullName?: string; initials?: string; avatarUrl?: string | null } | null | undefined,
    sizePx: number = 24
  ) => {
    if (!member) {
      return (
        <div
          style={{
            width: `${sizePx}px`,
            height: `${sizePx}px`,
            borderRadius: '50%',
            backgroundColor: '#E2E8F0',
            color: '#64748B',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: `${Math.round(sizePx * 0.42)}px`,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          ?
        </div>
      );
    }

    if (member.avatarUrl) {
      return (
        <img
          src={member.avatarUrl}
          alt={member.fullName || 'Member'}
          style={{
            width: `${sizePx}px`,
            height: `${sizePx}px`,
            borderRadius: '50%',
            objectFit: 'cover',
            flexShrink: 0,
            border: '1px solid #E2E8F0',
          }}
        />
      );
    }

    const initials = member.initials || getMemberInitials(member.fullName);
    return (
      <div
        style={{
          width: `${sizePx}px`,
          height: `${sizePx}px`,
          borderRadius: '50%',
          backgroundColor: getMemberColor(initials || member.fullName),
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: `${Math.round(sizePx * 0.42)}px`,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {initials}
      </div>
    );
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <span style={{ fontSize: '10px', color: '#94A3B8', marginLeft: '3px' }}>⇅</span>;
    }
    return (
      <span style={{ fontSize: '10px', color: '#2563EB', marginLeft: '3px', fontWeight: 800 }}>
        {sortAsc ? '↑' : '↓'}
      </span>
    );
  };

  if (loading) {
    return (
      <div
        style={{
          padding: '48px 20px',
          textAlign: 'center',
          color: '#64748B',
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          fontSize: '14px',
        }}
      >
        Loading live board data for TeamSync Dashboard...
      </div>
    );
  }

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '1080px',
        margin: '0 auto',
        backgroundColor: '#ffffff',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: '#0F172A',
        boxSizing: 'border-box',
      }}
    >
      {/* 1. TOP NAVBAR */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          borderBottom: '1px solid #F1F5F9',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        {/* Left Brand & Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: '#2563EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </div>
            <span style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.3px' }}>
              TeamSync
            </span>
            <span
              style={{
                backgroundColor: '#EEF2FF',
                color: '#4F46E5',
                fontSize: '11px',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '12px',
              }}
            >
              Power-up
            </span>
          </div>

          <nav style={{ display: 'flex', alignItems: 'center', gap: '16px', marginLeft: '4px' }}>
            <button
              type="button"
              onClick={() => setActiveNav('dashboard')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'none',
                border: 'none',
                padding: '6px 2px',
                fontSize: '14px',
                fontWeight: activeNav === 'dashboard' ? 700 : 500,
                color: activeNav === 'dashboard' ? '#2563EB' : '#64748B',
                borderBottom: activeNav === 'dashboard' ? '2.5px solid #2563EB' : '2.5px solid transparent',
                cursor: 'pointer',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
              </svg>
              Dashboard
            </button>

            <button
              type="button"
              onClick={() => setActiveNav('settings')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'none',
                border: 'none',
                padding: '6px 2px',
                fontSize: '14px',
                fontWeight: activeNav === 'settings' ? 700 : 500,
                color: activeNav === 'settings' ? '#2563EB' : '#64748B',
                borderBottom: activeNav === 'settings' ? '2.5px solid #2563EB' : '2.5px solid transparent',
                cursor: 'pointer',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              Settings
            </button>

            <button
              type="button"
              onClick={handleExportCSV}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                backgroundColor: exportFeedback ? '#ECFDF5' : '#ffffff',
                border: exportFeedback ? '1px solid #A7F3D0' : '1px solid #E2E8F0',
                borderRadius: '6px',
                padding: '5px 12px',
                fontSize: '12px',
                fontWeight: 600,
                color: exportFeedback ? '#065F46' : '#475569',
                cursor: 'pointer',
              }}
              title="Export current view as CSV"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {exportFeedback || 'Export'}
            </button>
          </nav>
        </div>

        {/* Right Live Board Status & Refresh */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              color: boardInfo.isConnected ? '#475569' : '#DC2626',
              fontWeight: 500,
            }}
            title={`Last synced ${formatRelativeSyncTime(boardInfo.lastSyncedAt)} • ${
              settings.autoRefreshSeconds > 0
                ? `Auto-sync every ${settings.autoRefreshSeconds}s`
                : 'Manual sync'
            }`}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '16px',
                height: '16px',
                borderRadius: '4px',
                backgroundColor: boardInfo.isConnected ? '#2563EB' : '#DC2626',
                color: '#ffffff',
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                {boardInfo.isConnected ? (
                  <polyline points="20 6 9 17 4 12" />
                ) : (
                  <line x1="6" y1="6" x2="18" y2="18" />
                )}
              </svg>
            </span>
            <span>
              {boardInfo.isConnected ? 'Connected to this board' : 'Sync connection error'}
            </span>
          </div> */}

          <button
            type="button"
            onClick={() => loadData()}
            disabled={isRefreshing}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              border: '1px solid #E2E8F0',
              backgroundColor: '#ffffff',
              color: '#475569',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
            title={`Refresh board data (synced ${formatRelativeSyncTime(boardInfo.lastSyncedAt)})`}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }}
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div style={{ padding: '24px 20px' }}>
        {activeNav === 'settings' ? (
          <SettingsPanel
            settings={settings}
            members={allKnownMembers}
            cards={cards}
            isRealTrello={Boolean(context.isRealTrello)}
            onSaveSettings={handleSaveSettings}
            onResetBoardDemo={onResetDemoData}
            onBackToDashboard={() => setActiveNav('dashboard')}
          />
        ) : (
          <>
            {/* 2. TITLE & SUBTITLE */}
            <div style={{ marginBottom: '20px' }}>
              <h1 style={{ fontSize: '24px', fontWeight: 800, margin: 0, color: '#0F172A', letterSpacing: '-0.4px' }}>
                TeamSync Dashboard
              </h1>
              <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#64748B' }}>
                Task ownership, handoffs, and team accountability for {boardInfo.name}
              </p>
            </div>

            {/* 3. TOP METRICS ROW (4 Cards + Circular Health Gauge) */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '14px',
                alignItems: 'center',
                marginBottom: '20px',
              }}
            >
              <div
                style={{
                  flex: '1 1 640px',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  gap: '14px',
                }}
              >
                {/* Card 1: Total Tasks */}
                <button
                  type="button"
                  onClick={() => {
                    clearAllFilters();
                    setActiveTab('task');
                  }}
                  style={{
                    textAlign: 'left',
                    backgroundColor: '#EFF6FF',
                    border: !hasActiveFilters && activeTab === 'task' ? '1.5px solid #93C5FD' : '1px solid #DBEAFE',
                    borderRadius: '12px',
                    padding: '14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    cursor: 'pointer',
                  }}
                  title="Show all tasks"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                      style={{
                        width: '26px',
                        height: '26px',
                        borderRadius: '6px',
                        backgroundColor: '#DBEAFE',
                        color: '#2563EB',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                        <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                      </svg>
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Total Tasks</span>
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: 800, color: '#0F172A', lineHeight: 1 }}>
                    {metrics.totalTasks}
                  </div>
                </button>

                {/* Card 2: Pending Tasks */}
                <button
                  type="button"
                  onClick={() => {
                    setOnlyPendingTasks(!onlyPendingTasks);
                    setOnlyPendingHandoffs(false);
                    setSelectedStatus('all');
                    setActiveTab('task');
                  }}
                  style={{
                    textAlign: 'left',
                    backgroundColor: '#EFF6FF',
                    border: onlyPendingTasks ? '2px solid #2563EB' : '1px solid #DBEAFE',
                    borderRadius: '12px',
                    padding: '14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    cursor: 'pointer',
                  }}
                  title="Filter open (non-completed) tasks"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                      style={{
                        width: '26px',
                        height: '26px',
                        borderRadius: '6px',
                        backgroundColor: '#DBEAFE',
                        color: '#2563EB',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Pending Tasks</span>
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: 800, color: '#0F172A', lineHeight: 1 }}>
                    {metrics.pendingTasks}
                  </div>
                </button>

                {/* Card 3: Overdue Tasks */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedStatus(selectedStatus === 'Overdue' ? 'all' : 'Overdue');
                    setOnlyPendingHandoffs(false);
                    setOnlyPendingTasks(false);
                    setActiveTab('task');
                  }}
                  style={{
                    textAlign: 'left',
                    backgroundColor: '#FEF2F2',
                    border: selectedStatus === 'Overdue' ? '2px solid #DC2626' : '1px solid #FEE2E2',
                    borderRadius: '12px',
                    padding: '14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    cursor: 'pointer',
                  }}
                  title="Filter overdue tasks"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                      style={{
                        width: '26px',
                        height: '26px',
                        borderRadius: '6px',
                        backgroundColor: '#FEE2E2',
                        color: '#DC2626',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Overdue Tasks</span>
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: 800, color: '#0F172A', lineHeight: 1 }}>
                    {metrics.overdueTasks}
                  </div>
                </button>

                {/* Card 4: Pending Handoffs */}
                <button
                  type="button"
                  onClick={() => {
                    if (activeTab === 'pending') {
                      setActiveTab('task');
                    } else {
                      setPendingScope('all');
                      setActiveTab('pending');
                    }
                  }}
                  style={{
                    textAlign: 'left',
                    backgroundColor: '#FFFBEB',
                    border: activeTab === 'pending' || onlyPendingHandoffs ? '2px solid #D97706' : '1px solid #FEF3C7',
                    borderRadius: '12px',
                    padding: '14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    cursor: 'pointer',
                  }}
                  title="Open Pending Actions View"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                      style={{
                        width: '26px',
                        height: '26px',
                        borderRadius: '6px',
                        backgroundColor: '#FEF3C7',
                        color: '#D97706',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="m16 3 4 4-4 4" />
                        <path d="M20 7H4" />
                        <path d="m8 21-4-4 4-4" />
                        <path d="M4 17h16" />
                      </svg>
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Pending Handoffs</span>
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: 800, color: '#0F172A', lineHeight: 1 }}>
                    {metrics.pendingHandoffs}
                  </div>
                </button>
              </div>

              {/* Right Circular Health Gauge */}
              <div
                style={{
                  width: '150px',
                  flexShrink: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto',
                }}
                title={`${metrics.healthLabel}: ${metrics.overdueTasks} overdue, ${metrics.unownedTasks} unassigned, ${metrics.escalatedHandoffs} escalated handoffs`}
              >
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px', textAlign: 'center' }}>
                  Team Health Score
                </span>
                <div style={{ position: 'relative', width: '74px', height: '74px' }}>
                  <svg width="74" height="74" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="40" fill="none" stroke="#E2E8F0" strokeWidth="9" />
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke={metrics.healthColor}
                      strokeWidth="9"
                      strokeDasharray="251.2"
                      strokeDashoffset={251.2 * (1 - metrics.healthScore / 100)}
                      strokeLinecap="round"
                      transform="rotate(-90 50 50)"
                      style={{ transition: 'stroke-dashoffset 0.4s ease, stroke 0.3s ease' }}
                    />
                  </svg>
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '18px',
                      fontWeight: 800,
                      color: '#0F172A',
                    }}
                  >
                    {metrics.healthScore}%
                  </div>
                </div>
              </div>
            </div>

            {/* 4. AI SUMMARY CARD */}
            {/* <div
              style={{
                backgroundColor: '#F8F7FF',
                border: '1px solid #EDE9FE',
                borderRadius: '14px',
                padding: '16px 20px',
                marginBottom: '22px',
              }}
             >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    style={{
                      width: '20px',
                      height: '20px',
                      color: '#7C3AED',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2L9.5 8.5 3 11l6.5 2.5L12 20l2.5-6.5L21 11l-6.5-2.5z" />
                    </svg>
                  </div>
                  <span style={{ fontSize: '15px', fontWeight: 800, color: '#4C1D95' }}>AI Summary</span>
                  <span
                    style={{
                      backgroundColor: '#EDE9FE',
                      color: '#7C3AED',
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '12px',
                    }}
                  >
                    {isRegeneratingAi ? 'Analyzing board...' : `Generated ${formatRelativeSyncTime(aiGeneratedAt)}`}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleRegenerate}
                  disabled={isRegeneratingAi}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    backgroundColor: '#ffffff',
                    border: '1px solid #DDD6FE',
                    borderRadius: '6px',
                    padding: '5px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#6B21A8',
                    cursor: 'pointer',
                  }}
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{ animation: isRegeneratingAi ? 'spin 0.8s linear infinite' : 'none' }}
                  >
                    <polyline points="23 4 23 10 17 10" />
                    <polyline points="1 20 1 14 7 14" />
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                  </svg>
                  Regenerate
                </button>
              </div>

              <ul
                style={{
                  margin: 0,
                  paddingLeft: '18px',
                  color: '#334155',
                  fontSize: '13px',
                  lineHeight: 1.6,
                  opacity: isRegeneratingAi ? 0.55 : 1,
                  transition: 'opacity 0.2s ease',
                }}
              >
                {aiBullets.map((bullet, i) => (
                  <li key={i}>{bullet}</li>
                ))}
              </ul>
            </div> */}

            {/* 4B. ESCALATION ALERT BANNER (P1 Escalation & Manager Notification) */}
            {escalatedPendingCards.length > 0 && (() => {
              const isManager = Boolean(
                currentMember && escalationContact && currentMember.id === escalationContact.id
              );
              return (
                <div
                  style={{
                    backgroundColor: isManager && unacknowledgedEscalations.length > 0 ? '#FEF2F2' : '#FFF7ED',
                    border: isManager && unacknowledgedEscalations.length > 0
                      ? '1.5px solid #FCA5A5'
                      : '1px solid #FED7AA',
                    borderRadius: '12px',
                    padding: '12px 16px',
                    marginBottom: '18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                  }}
                >
                  <div style={{ flex: '1 1 360px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                      <span
                        style={{
                          backgroundColor: '#DC2626',
                          color: '#ffffff',
                          fontSize: '10px',
                          fontWeight: 800,
                          padding: '2px 7px',
                          borderRadius: '6px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.4px',
                        }}
                      >
                        Escalation {unacknowledgedEscalations.length > 0 ? 'Alert' : 'Monitored'}
                      </span>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#7F1D1D' }}>
                        {isManager
                          ? `Attention ${escalationContact!.fullName}: ${escalatedPendingCards.length} handoff${escalatedPendingCards.length > 1 ? 's' : ''} exceeded ${settings.escalationThresholdHours}h`
                          : `${escalatedPendingCards.length} handoff${escalatedPendingCards.length > 1 ? 's' : ''} exceeded ${settings.escalationThresholdHours}h threshold`}
                      </span>
                      {!isManager && (
                        <span style={{ fontSize: '12px', color: '#9A3412' }}>
                          {escalationContact
                            ? `• Lead alerted: ${escalationContact.fullName}`
                            : '• No Escalation Lead designated'}
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                      {escalatedPendingCards.slice(0, 3).map((c) => {
                        const ho = c.data.handoff!;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setInspectedCardId(c.id)}
                            style={{
                              backgroundColor: '#ffffff',
                              border: '1px solid #FECACA',
                              color: '#991B1B',
                              borderRadius: '6px',
                              padding: '3px 8px',
                              fontSize: '11px',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            {c.name}: {ho.fromMember.fullName} &rarr; {ho.toMember.fullName} (
                            {formatExactTimeAgo(ho.createdAt, nowMs)})
                            {ho.escalationAcknowledgedAt ? ' ✓' : ''}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    {isManager && unacknowledgedEscalations.length > 0 && (
                      <button
                        type="button"
                        onClick={handleAcknowledgeAllEscalations}
                        style={{
                          backgroundColor: '#991B1B',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '8px',
                          padding: '6px 12px',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Acknowledge All ({unacknowledgedEscalations.length})
                      </button>
                    )}

                    {!escalationContact && (
                      <button
                        type="button"
                        onClick={() => setActiveNav('settings')}
                        style={{
                          backgroundColor: '#ffffff',
                          color: '#9A3412',
                          border: '1px solid #FDBA74',
                          borderRadius: '8px',
                          padding: '6px 11px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Set Escalation Lead
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setPendingScope('escalated');
                        setActiveTab('pending');
                      }}
                      style={{
                        backgroundColor: '#ffffff',
                        color: '#991B1B',
                        border: '1px solid #FCA5A5',
                        borderRadius: '8px',
                        padding: '6px 12px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Review Escalated &rarr;
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* 5. VIEW SWITCHER TABS */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setActiveTab('task')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    backgroundColor: activeTab === 'task' ? '#EFF6FF' : 'transparent',
                    border: activeTab === 'task' ? '1px solid #BFDBFE' : '1px solid transparent',
                    borderBottom: activeTab === 'task' ? '2.5px solid #2563EB' : '1px solid transparent',
                    borderRadius: '8px',
                    padding: '6px 14px',
                    fontSize: '13px',
                    fontWeight: 700,
                    color: activeTab === 'task' ? '#2563EB' : '#64748B',
                    cursor: 'pointer',
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <line x1="8" y1="6" x2="21" y2="6" />
                    <line x1="8" y1="12" x2="21" y2="12" />
                    <line x1="8" y1="18" x2="21" y2="18" />
                    <line x1="3" y1="6" x2="3.01" y2="6" />
                    <line x1="3" y1="12" x2="3.01" y2="12" />
                    <line x1="3" y1="18" x2="3.01" y2="18" />
                  </svg>
                  Task View
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('pending')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    backgroundColor: activeTab === 'pending' ? '#EFF6FF' : 'transparent',
                    border: activeTab === 'pending' ? '1px solid #BFDBFE' : '1px solid transparent',
                    borderBottom: activeTab === 'pending' ? '2.5px solid #2563EB' : '1px solid transparent',
                    borderRadius: '8px',
                    padding: '6px 14px',
                    fontSize: '13px',
                    fontWeight: 700,
                    color: activeTab === 'pending' ? '#2563EB' : '#64748B',
                    cursor: 'pointer',
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  Pending Actions
                  <span
                    style={{
                      backgroundColor:
                        metrics.escalatedHandoffs > 0
                          ? '#FEE2E2'
                          : metrics.pendingHandoffs > 0
                            ? '#FEF3C7'
                            : '#F1F5F9',
                      color:
                        metrics.escalatedHandoffs > 0
                          ? '#B91C1C'
                          : metrics.pendingHandoffs > 0
                            ? '#B45309'
                            : '#64748B',
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '1px 6px',
                      borderRadius: '10px',
                    }}
                  >
                    {metrics.pendingHandoffs}
                  </span>
                  {myPendingCount > 0 && (
                    <span
                      style={{
                        backgroundColor: '#2563EB',
                        color: '#ffffff',
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '1px 6px',
                        borderRadius: '10px',
                      }}
                    >
                      You: {myPendingCount}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('member')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    backgroundColor: activeTab === 'member' ? '#EFF6FF' : 'transparent',
                    border: activeTab === 'member' ? '1px solid #BFDBFE' : '1px solid transparent',
                    borderBottom: activeTab === 'member' ? '2.5px solid #2563EB' : '1px solid transparent',
                    borderRadius: '8px',
                    padding: '6px 14px',
                    fontSize: '13px',
                    fontWeight: 700,
                    color: activeTab === 'member' ? '#2563EB' : '#64748B',
                    cursor: 'pointer',
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  Member View
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('history')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    backgroundColor: activeTab === 'history' ? '#EFF6FF' : 'transparent',
                    border: activeTab === 'history' ? '1px solid #BFDBFE' : '1px solid transparent',
                    borderBottom: activeTab === 'history' ? '2.5px solid #2563EB' : '1px solid transparent',
                    borderRadius: '8px',
                    padding: '6px 14px',
                    fontSize: '13px',
                    fontWeight: 700,
                    color: activeTab === 'history' ? '#2563EB' : '#64748B',
                    cursor: 'pointer',
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                    <path d="M12 7v5l4 2" />
                  </svg>
                  History
                  <span
                    style={{
                      backgroundColor: '#F1F5F9',
                      color: '#475569',
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '1px 6px',
                      borderRadius: '10px',
                    }}
                  >
                    {totalHistoryCount}
                  </span>
                </button>
              </div>

              {hasActiveFilters && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {onlyPendingHandoffs && (
                    <span
                      style={{
                        backgroundColor: '#FEF3C7',
                        color: '#92400E',
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '10px',
                      }}
                    >
                      Pending Handoffs Only
                    </span>
                  )}
                  {onlyPendingTasks && (
                    <span
                      style={{
                        backgroundColor: '#DBEAFE',
                        color: '#1E40AF',
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '10px',
                      }}
                    >
                      Open Tasks Only
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#2563EB',
                      cursor: 'pointer',
                    }}
                  >
                    Clear filters ({filteredCards.length}/{cards.length})
                  </button>
                </div>
              )}
            </div>

            {/* Filter Controls Row */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px',
                marginBottom: '14px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                {/* All Members */}
                <div style={{ position: 'relative' }}>
                  <select
                    value={selectedMember}
                    onChange={(e) => setSelectedMember(e.target.value)}
                    style={{
                      padding: '7px 28px 7px 28px',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#334155',
                      backgroundColor: '#ffffff',
                      colorScheme: 'light',
                      border: '1px solid #E2E8F0',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      appearance: 'none',
                    }}
                  >
                    <option value="all">All Members</option>
                    {activeTab === 'task' || activeTab === 'member' ? (
                      <option value="unassigned">Unassigned Only</option>
                    ) : null}
                    {allKnownMembers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.fullName}
                      </option>
                    ))}
                  </select>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{ position: 'absolute', left: 9, top: 10, color: '#64748B', pointerEvents: 'none' }}
                  >
                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                  </svg>
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{ position: 'absolute', right: 10, top: 11, color: '#64748B', pointerEvents: 'none' }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>

                {(activeTab === 'task' || activeTab === 'member') && (
                  <>
                    {/* All Statuses */}
                    <div style={{ position: 'relative' }}>
                      <select
                        value={selectedStatus}
                        onChange={(e) => setSelectedStatus(e.target.value)}
                        style={{
                          padding: '7px 28px 7px 12px',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: '#334155',
                          backgroundColor: '#ffffff',
                          colorScheme: 'light',
                          border: '1px solid #E2E8F0',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          appearance: 'none',
                        }}
                      >
                        <option value="all">All Statuses</option>
                        <option value="Overdue">Overdue</option>
                        <option value="In Progress">In Progress</option>
                        <option value="To Do">To Do</option>
                        <option value="Done">Done</option>
                        <option value="Needs Owner">Needs Owner</option>
                        <option value="Escalated">Escalated Handoff</option>
                      </select>
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        style={{ position: 'absolute', right: 10, top: 11, color: '#64748B', pointerEvents: 'none' }}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </div>

                    {/* All Priorities */}
                    {/* <div style={{ position: 'relative' }}>
                      <select
                        value={selectedPriority}
                        onChange={(e) => setSelectedPriority(e.target.value)}
                        style={{
                          padding: '7px 28px 7px 12px',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: '#334155',
                          backgroundColor: '#ffffff',
                          colorScheme: 'light',
                          border: '1px solid #E2E8F0',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          appearance: 'none',
                        }}
                      >
                        <option value="all">All Priorities</option>
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                      </select>
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        style={{ position: 'absolute', right: 10, top: 11, color: '#64748B', pointerEvents: 'none' }}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </div> */}

                    {/* All Deadlines (Dynamic Real-Time Buckets) */}
                    {/* <div style={{ position: 'relative' }}>
                      <select
                        value={selectedDeadline}
                        onChange={(e) => setSelectedDeadline(e.target.value)}
                        style={{
                          padding: '7px 28px 7px 28px',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: '#334155',
                          backgroundColor: '#ffffff',
                          colorScheme: 'light',
                          border: '1px solid #E2E8F0',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          appearance: 'none',
                        }}
                      >
                        <option value="all">All Deadlines</option>
                        <option value="overdue">Overdue</option>
                        <option value="today">Due Today</option>
                        <option value="week">Due Next 7 Days</option>
                        <option value="upcoming">All Upcoming</option>
                        <option value="none">No Deadline</option>
                      </select>
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        style={{ position: 'absolute', left: 9, top: 10, color: '#64748B', pointerEvents: 'none' }}
                      >
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        style={{ position: 'absolute', right: 10, top: 11, color: '#64748B', pointerEvents: 'none' }}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </div> */}
                  </>
                )}
              </div>

              {/* Search Box */}
              <div style={{ position: 'relative', width: '220px' }}>
                <input
                  type="text"
                  placeholder={
                    activeTab === 'history'
                      ? 'Search history events...'
                      : activeTab === 'pending'
                        ? 'Search pending handoffs...'
                        : 'Search tasks...'
                  }
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '7px 10px 7px 30px',
                    fontSize: '12px',
                    borderRadius: '8px',
                    border: '1px solid #E2E8F0',
                    backgroundColor: '#ffffff',
                    color: '#0F172A',
                    colorScheme: 'light',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  style={{ position: 'absolute', left: 10, top: 9, color: '#94A3B8', pointerEvents: 'none' }}
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </div>
            </div>

            {/* 6. TASK VIEW TABLE OR MEMBER VIEW */}
            {activeTab === 'task' ? (
              <div
                style={{
                  border: '1px solid #E2E8F0',
                  borderRadius: '10px',
                  overflowX: 'auto',
                  backgroundColor: '#ffffff',
                }}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '640px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#F1F5F9', borderBottom: '1px solid #E2E8F0' }}>
                      <th
                        onClick={() => toggleSort('name')}
                        style={{
                          padding: '12px 16px',
                          fontSize: '12px',
                          fontWeight: 700,
                          color: '#475569',
                          cursor: 'pointer',
                          userSelect: 'none',
                          width: '38%',
                        }}
                      >
                        Task {renderSortIcon('name')}
                      </th>
                      <th
                        onClick={() => toggleSort('owner')}
                        style={{
                          padding: '12px 16px',
                          fontSize: '12px',
                          fontWeight: 700,
                          color: '#475569',
                          cursor: 'pointer',
                          userSelect: 'none',
                          width: '24%',
                        }}
                      >
                        Owner {renderSortIcon('owner')}
                      </th>
                      <th
                        onClick={() => toggleSort('status')}
                        style={{
                          padding: '12px 16px',
                          fontSize: '12px',
                          fontWeight: 700,
                          color: '#475569',
                          cursor: 'pointer',
                          userSelect: 'none',
                          width: '17%',
                        }}
                      >
                        Status {renderSortIcon('status')}
                      </th>
                      <th
                        onClick={() => toggleSort('handoff')}
                        style={{
                          padding: '12px 16px',
                          fontSize: '12px',
                          fontWeight: 700,
                          color: '#475569',
                          cursor: 'pointer',
                          userSelect: 'none',
                          width: '21%',
                        }}
                        title="Accountability remains on current owner until handoff recipient accepts"
                      >
                        Handoff <span style={{ fontSize: '11px', color: '#94A3B8' }}>ⓘ</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCards.map((card, idx) => {
                      const status = getCardLifecycleStatus(card);
                      const handoff = getCardHandoffDisplay(
                        card,
                        settings.escalationThresholdHours,
                        escalationContact?.fullName,
                        nowMs
                      );
                      const ho = card.data.handoff;

                      return (
                        <tr
                          key={card.id}
                          onClick={() => setInspectedCardId(card.id)}
                          style={{
                            borderBottom: idx === sortedCards.length - 1 ? 'none' : '1px solid #F1F5F9',
                            cursor: 'pointer',
                            transition: 'background-color 0.1s',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                        >
                          {/* Task Name */}
                          <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 500, color: '#0F172A' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" style={{ flexShrink: 0 }}>
                                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                                <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                              </svg>
                              <span>{card.name}</span>
                            </div>
                          </td>

                          {/* Owner */}
                          <td style={{ padding: '12px 16px', fontSize: '13px', color: '#0F172A' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {renderMemberAvatar(card.data.owner, 24)}
                              <span
                                style={{
                                  fontWeight: card.data.owner ? 500 : 600,
                                  color: card.data.owner ? '#0F172A' : '#DC2626',
                                }}
                              >
                                {card.data.owner?.fullName || 'Unassigned'}
                              </span>
                            </div>
                          </td>

                          {/* Status */}
                          <td style={{ padding: '12px 16px' }}>
                            {status === 'Overdue' ? (
                              <span
                                style={{
                                  backgroundColor: '#FEE2E2',
                                  color: '#DC2626',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                Overdue
                              </span>
                            ) : status === 'Done' ? (
                              <span
                                style={{
                                  backgroundColor: '#DCFCE7',
                                  color: '#15803D',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                Done
                              </span>
                            ) : status === 'To Do' ? (
                              <span
                                style={{
                                  backgroundColor: '#F1F5F9',
                                  color: '#475569',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                To Do
                              </span>
                            ) : (
                              <span
                                style={{
                                  backgroundColor: '#DBEAFE',
                                  color: '#2563EB',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                In Progress
                              </span>
                            )}
                          </td>

                          {/* Handoff Status */}
                          <td style={{ padding: '12px 16px' }} title={handoff.tooltip}>
                            {handoff.state === 'escalated' && ho ? (
                              <div>
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    backgroundColor: '#FEF2F2',
                                    border: '1px solid #FECACA',
                                    color: '#DC2626',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  <span>🚨</span> Escalated &bull; {handoff.exactAgo}
                                </span>
                                <div style={{ fontSize: '10px', color: '#991B1B', fontWeight: 600, marginTop: '3px' }}>
                                  {ho.fromMember.fullName.split(' ')[0]} &rarr; {ho.toMember.fullName.split(' ')[0]}
                                </div>
                              </div>
                            ) : handoff.state === 'pending' && ho ? (
                              <div>
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    backgroundColor: '#FEF3C7',
                                    color: '#B45309',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  <span>⇄</span> Pending &bull; {handoff.exactAgo}
                                </span>
                                <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 500, marginTop: '3px' }}>
                                  {ho.fromMember.fullName.split(' ')[0]} &rarr; {ho.toMember.fullName.split(' ')[0]}
                                </div>
                              </div>
                            ) : handoff.state === 'declined' ? (
                              <span
                                style={{
                                  backgroundColor: '#FEE2E2',
                                  color: '#B91C1C',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                Declined
                              </span>
                            ) : handoff.state === 'in_progress' ? (
                              <span
                                style={{
                                  backgroundColor: '#DBEAFE',
                                  color: '#2563EB',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                In Progress
                              </span>
                            ) : handoff.state === 'completed' ? (
                              <span
                                style={{
                                  backgroundColor: '#DCFCE7',
                                  color: '#15803D',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                Completed
                              </span>
                            ) : (
                              <span
                                style={{
                                  backgroundColor: '#F1F5F9',
                                  color: '#64748B',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                Not started
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}

                    {sortedCards.length === 0 && (
                      <tr>
                        <td colSpan={4} style={{ padding: '32px', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
                          No tasks match the active filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : activeTab === 'pending' ? (
              <PendingActionsPanel
                cards={cards}
                currentMember={currentMember}
                escalationContact={escalationContact}
                escalationThresholdHours={settings.escalationThresholdHours}
                nowMs={nowMs}
                search={search}
                selectedMember={selectedMember}
                scope={pendingScope}
                onScopeChange={setPendingScope}
                onInspectCard={(id) => setInspectedCardId(id)}
                onAcceptHandoff={handleInlineAcceptHandoff}
                onDeclineHandoff={handleInlineDeclineHandoff}
                onCancelHandoff={handleInlineCancelHandoff}
                onNotifyEscalation={handleInlineNotifyEscalation}
                onAcknowledgeEscalation={handleInlineAcknowledgeEscalation}
                onOpenSettings={() => setActiveNav('settings')}
              />
            ) : activeTab === 'history' ? (
              <HistoryFeedPanel
                cards={cards}
                members={allKnownMembers}
                nowMs={nowMs}
                search={search}
                selectedMember={selectedMember}
                boardName={boardInfo.name}
                onInspectCard={(id) => setInspectedCardId(id)}
              />
            ) : (
              /* 7. MEMBER VIEW GRID */
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: '16px',
                }}
              >
                {allKnownMembers
                  .filter((m) => selectedMember === 'all' || selectedMember === m.id)
                  .map((m) => {
                    const memberTasks = filteredCards.filter((c) => c.data.owner?.id === m.id);
                    const overdueTasks = memberTasks.filter((c) => isCardOverdue(c));
                    const incomingHandoffs = cards.filter(
                      (c) => c.data.handoff?.status === 'pending' && c.data.handoff.toMember.id === m.id
                    );
                    const outgoingHandoffs = memberTasks.filter((c) => c.data.handoff?.status === 'pending');

                    return (
                      <div
                        key={m.id}
                        style={{
                          backgroundColor: '#ffffff',
                          border: '1px solid #E2E8F0',
                          borderRadius: '12px',
                          padding: '16px',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                          minWidth: 0,
                          overflow: 'hidden',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                            {renderMemberAvatar(m, 34)}
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.fullName}</div>
                              <div style={{ fontSize: '11px', color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {m.role || `@${m.username}`}
                              </div>
                            </div>
                          </div>
                          <span
                            style={{
                              backgroundColor: '#EFF6FF',
                              color: '#2563EB',
                              fontSize: '11px',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '10px',
                              flexShrink: 0,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {memberTasks.length} {memberTasks.length === 1 ? 'task' : 'tasks'}
                          </span>
                        </div>

                        {(overdueTasks.length > 0 || incomingHandoffs.length > 0 || outgoingHandoffs.length > 0) && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                            {overdueTasks.length > 0 && (
                              <span
                                style={{
                                  backgroundColor: '#FEE2E2',
                                  color: '#DC2626',
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                }}
                              >
                                {overdueTasks.length} overdue
                              </span>
                            )}
                            {incomingHandoffs.length > 0 && (
                              <span
                                style={{
                                  backgroundColor: '#FEF3C7',
                                  color: '#B45309',
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                }}
                              >
                                {incomingHandoffs.length} awaiting acceptance
                              </span>
                            )}
                            {outgoingHandoffs.length > 0 && (
                              <span
                                style={{
                                  backgroundColor: '#EEF2FF',
                                  color: '#4F46E5',
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                }}
                              >
                                {outgoingHandoffs.length} handoff sent
                              </span>
                            )}
                          </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
                          {memberTasks.map((t) => {
                            const tOverdue = isCardOverdue(t);
                            return (
                              <div
                                key={t.id}
                                onClick={() => setInspectedCardId(t.id)}
                                title={t.name}
                                style={{
                                  padding: '8px 10px',
                                  backgroundColor: '#F8FAFC',
                                  border: '1px solid #F1F5F9',
                                  borderRadius: '6px',
                                  fontSize: '12px',
                                  fontWeight: 500,
                                  color: '#1E293B',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: '8px',
                                  minWidth: 0,
                                  overflow: 'hidden',
                                }}
                              >
                                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {t.name}
                                </span>
                                <span style={{ fontSize: '10px', color: tOverdue ? '#DC2626' : '#64748B', fontWeight: tOverdue ? 700 : 500, flexShrink: 0, whiteSpace: 'nowrap' }}>
                                  {formatCardDeadline(t)}
                                </span>
                              </div>
                            );
                          })}

                          {incomingHandoffs
                            .filter((h) => !memberTasks.some((mt) => mt.id === h.id))
                            .map((h) => (
                              <div
                                key={`ho_${h.id}`}
                                onClick={() => setInspectedCardId(h.id)}
                                title={h.name}
                                style={{
                                  padding: '8px 10px',
                                  backgroundColor: '#FFFBEB',
                                  border: '1px solid #FDE68A',
                                  borderRadius: '6px',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  color: '#92400E',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: '8px',
                                  minWidth: 0,
                                  overflow: 'hidden',
                                }}
                              >
                                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  ⇄ Accept: {h.name}
                                </span>
                                <span style={{ fontSize: '10px', flexShrink: 0, whiteSpace: 'nowrap' }}>
                                  from {h.data.handoff?.fromMember.fullName.split(' ')[0]}
                                </span>
                              </div>
                            ))}

                          {memberTasks.length === 0 && incomingHandoffs.length === 0 && (
                            <div style={{ fontSize: '12px', color: '#94A3B8', fontStyle: 'italic', padding: '4px 0' }}>
                              No matching tasks assigned
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                {/* Unassigned Tasks Card (visible if all members or unassigned filter active) */}
                {(selectedMember === 'all' || selectedMember === 'unassigned') && (
                  (() => {
                    const unassignedTasks = filteredCards.filter((c) => !c.data.owner);
                    if (unassignedTasks.length === 0 && selectedMember !== 'unassigned') return null;

                    return (
                      <div
                        style={{
                          backgroundColor: '#FEF2F2',
                          border: '1.5px dashed #FCA5A5',
                          borderRadius: '12px',
                          padding: '16px',
                          minWidth: 0,
                          overflow: 'hidden',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                            {renderMemberAvatar(null, 34)}
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: '14px', fontWeight: 700, color: '#991B1B' }}>Unassigned Tasks</div>
                              <div style={{ fontSize: '11px', color: '#DC2626' }}>Needs Primary Owner</div>
                            </div>
                          </div>
                          <span
                            style={{
                              backgroundColor: '#DC2626',
                              color: '#ffffff',
                              fontSize: '11px',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '10px',
                              flexShrink: 0,
                            }}
                          >
                            {unassignedTasks.length}
                          </span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
                          {unassignedTasks.map((t) => (
                            <div
                              key={t.id}
                              onClick={() => setInspectedCardId(t.id)}
                              title={t.name}
                              style={{
                                padding: '8px 10px',
                                backgroundColor: '#ffffff',
                                border: '1px solid #FECACA',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: 600,
                                color: '#991B1B',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '8px',
                                minWidth: 0,
                                overflow: 'hidden',
                              }}
                            >
                              <span
                                style={{
                                  flex: 1,
                                  minWidth: 0,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {t.name}
                              </span>
                              <span style={{ fontSize: '10px', color: '#DC2626', flexShrink: 0, whiteSpace: 'nowrap' }}>
                                Assign &rarr;
                              </span>
                            </div>
                          ))}

                          {unassignedTasks.length === 0 && (
                            <div style={{ fontSize: '12px', color: '#059669', fontWeight: 600 }}>
                              All active tasks have designated owners!
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Inline Card Inspector & Actions Modal */}
      {inspectedCard && (
        <CardInspectorModal
          card={inspectedCard}
          context={context}
          settings={settings}
          escalationContact={escalationContact}
          onClose={() => setInspectedCardId(null)}
          onUpdated={() => loadData({ silent: true })}
        />
      )}
    </div>
  );
};
