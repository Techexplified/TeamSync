import React, { useState, useEffect, useRef } from 'react';
import type {
  TeamSyncCardData,
  TeamMember,
  HistoryEventType,
  ITrelloContext,
} from '../../types/teamsync';
import { subscribeToTeamSyncUpdates } from '../../trello/trelloBridge';
import { OwnerSection } from './OwnerSection';
import { HandoffSection } from './HandoffSection';
import { DEFAULT_ESCALATION_THRESHOLD_HOURS, formatExactTimeAgo } from '../../utils/statusUtils';
import {
  buildAcceptHandoffData,
  buildCancelHandoffData,
  buildDeclineHandoffData,
  buildEscalationData,
  buildRequestHandoffData,
} from '../../utils/handoffActions';

interface CardSectionProps {
  context: ITrelloContext;
  escalationThresholdHours?: number;
  escalationContact?: TeamMember | null;
  onDataChange?: (data: TeamSyncCardData) => void;
}

type HistoryFilter = 'all' | 'ownership' | 'handoffs' | 'escalations';

const HISTORY_BADGE_COLORS: Record<
  HistoryEventType,
  { dot: string; bg: string; text: string; label: string }
> = {
  owner_assigned: { dot: '#2563EB', bg: '#EFF6FF', text: '#1D4ED8', label: 'Owner' },
  owner_removed: { dot: '#DC2626', bg: '#FEE2E2', text: '#B91C1C', label: 'Unassigned' },
  handoff_requested: { dot: '#D97706', bg: '#FEF3C7', text: '#B45309', label: 'Handoff' },
  handoff_accepted: { dot: '#059669', bg: '#DCFCE7', text: '#047857', label: 'Accepted' },
  handoff_declined: { dot: '#DC2626', bg: '#FEE2E2', text: '#B91C1C', label: 'Declined' },
  handoff_cancelled: { dot: '#64748B', bg: '#F1F5F9', text: '#475569', label: 'Cancelled' },
  handoff_escalated: { dot: '#B91C1C', bg: '#FEF2F2', text: '#991B1B', label: 'Escalated' },
};

export const CardSection: React.FC<CardSectionProps> = ({
  context,
  escalationThresholdHours,
  escalationContact,
  onDataChange,
}) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TeamSyncCardData>({
    owner: null,
    handoff: null,
    history: [],
  });
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [currentMember, setCurrentMember] = useState<TeamMember | null>(null);
  const [loadedThresholdHours, setLoadedThresholdHours] = useState<number>(
    DEFAULT_ESCALATION_THRESHOLD_HOURS
  );
  const [loadedEscalationContactId, setLoadedEscalationContactId] = useState<string>('');
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const alertedEscalationRef = useRef<Set<string>>(new Set());
  const lastCardJsonRef = useRef<string>('');

  const thresholdHours = escalationThresholdHours ?? loadedThresholdHours;
  const resolvedEscalationContact =
    escalationContact !== undefined
      ? escalationContact
      : loadedEscalationContactId
        ? members.find((m) => m.id === loadedEscalationContactId) || null
        : null;

  useEffect(() => {
    let active = true;
    let initialLoad = true;

    const loadSnapshot = () => {
      Promise.all([
        context.getCardData(),
        context.getMembers(),
        context.getCurrentMember().catch(() => null),
        context.getSettings ? context.getSettings().catch(() => null) : Promise.resolve(null),
      ])
        .then(([cardData, memberList, current, settings]) => {
          if (!active) return;

          const effectiveThreshold =
            escalationThresholdHours ??
            settings?.escalationThresholdHours ??
            DEFAULT_ESCALATION_THRESHOLD_HOURS;
          const contactId = settings?.escalationContactId || '';
          const contactMember =
            escalationContact !== undefined
              ? escalationContact
              : contactId
                ? memberList.find((m) => m.id === contactId) || null
                : null;

          const { nextData, didChange } = buildEscalationData(
            cardData,
            effectiveThreshold,
            contactMember,
            null
          );

          const nextJson = JSON.stringify(nextData);
          if (initialLoad || nextJson !== lastCardJsonRef.current) {
            lastCardJsonRef.current = nextJson;
            setData(nextData);
            setTimeout(() => context.sizeToContent?.(), 50);
          }

          setMembers(memberList);
          setCurrentMember(current);
          if (settings) {
            setLoadedThresholdHours(settings.escalationThresholdHours);
            setLoadedEscalationContactId(settings.escalationContactId || '');
          }

          if (didChange) {
            context.setCardData(nextData).catch((err) => {
              console.warn('Could not persist automatic escalation metadata', err);
            });
          }

          if (
            nextData.handoff?.status === 'pending' &&
            nextData.handoff.escalatedAt &&
            !nextData.handoff.escalationAcknowledgedAt &&
            contactMember &&
            current?.id === contactMember.id &&
            !alertedEscalationRef.current.has(nextData.handoff.id)
          ) {
            alertedEscalationRef.current.add(nextData.handoff.id);
            context.notify?.(
              `Escalation Alert: Handoff from ${nextData.handoff.fromMember.fullName} to ${nextData.handoff.toMember.fullName} exceeded ${effectiveThreshold}h`
            );
          }
        })
        .catch((e) => {
          console.error('Failed to load card data', e);
        })
        .finally(() => {
          if (!active) return;
          if (initialLoad) {
            initialLoad = false;
            setLoading(false);
            setTimeout(() => context.sizeToContent?.(), 50);
          }
        });
    };

    loadSnapshot();

    const unsubscribeSync = subscribeToTeamSyncUpdates(loadSnapshot);
    const handleFocus = () => loadSnapshot();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') loadSnapshot();
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    const pollTimer = window.setInterval(loadSnapshot, 10000);

    return () => {
      active = false;
      unsubscribeSync();
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.clearInterval(pollTimer);
    };
  }, [context, escalationThresholdHours, escalationContact]);

  const updateCardData = async (newData: TeamSyncCardData) => {
    lastCardJsonRef.current = JSON.stringify(newData);
    setData(newData);
    await context.setCardData(newData);
    if (onDataChange) onDataChange(newData);
    setTimeout(() => context.sizeToContent?.(), 50);
  };

  // P0: Assign or Reassign Primary Owner
  const handleAssignOwner = async (
    member: TeamMember,
    options?: { viaClaim?: boolean }
  ) => {
    // Guardrail: unassigned tasks cannot be assigned to oneself manually; must use Claim Task
    if (!data.owner && !options?.viaClaim && currentMember && member.id === currentMember.id) {
      context.notify?.('Use "Claim Task" to assign this unassigned task to yourself.');
      return;
    }

    const actor = currentMember || member;
    const now = new Date().toISOString();
    const isReassignment = !!data.owner;

    const summary = options?.viaClaim
      ? `${actor.fullName} claimed primary ownership`
      : isReassignment
        ? `${actor.fullName} transferred primary ownership to ${member.fullName}`
        : `${actor.fullName} assigned primary ownership to ${member.fullName}`;

    const newHistory = [
      {
        id: `hist_${Date.now()}`,
        type: 'owner_assigned' as const,
        actor: { id: actor.id, fullName: actor.fullName },
        timestamp: now,
        summary,
      },
      ...data.history,
    ];

    const newData: TeamSyncCardData = {
      ...data,
      owner: {
        id: member.id,
        fullName: member.fullName,
        username: member.username,
        avatarUrl: member.avatarUrl,
        initials: member.initials,
        assignedAt: now,
        assignedBy: { id: actor.id, fullName: actor.fullName },
      },
      history: newHistory,
    };

    await updateCardData(newData);
    context.notify?.(
      options?.viaClaim
        ? `You claimed primary ownership of this task`
        : `Primary owner assigned to ${member.fullName}`
    );
  };

  // P0: Remove Owner (Mark as Unassigned)
  const handleRemoveOwner = async () => {
    if (!data.owner) return;
    const actor = currentMember || { id: 'unknown', fullName: 'User' };
    const now = new Date().toISOString();

    const newHistory = [
      {
        id: `hist_${Date.now()}`,
        type: 'owner_removed' as const,
        actor: { id: actor.id, fullName: actor.fullName },
        timestamp: now,
        summary: `${actor.fullName} removed ${data.owner.fullName} as primary owner`,
      },
      ...data.history,
    ];

    const newData: TeamSyncCardData = {
      ...data,
      owner: null,
      history: newHistory,
    };

    await updateCardData(newData);
    context.notify?.('Task marked as unassigned');
  };

  // P0: Request Task Handoff
  // Guardrail: Only the assigned owner can initiate a handoff, and owner remains unchanged until accepted
  const handleRequestHandoff = async (toMember: TeamMember, note: string) => {
    // Re-read authoritative card owner & active member before initiating handoff
    const [latestData, latestCurrentMember] = await Promise.all([
      context.getCardData().catch(() => data),
      context.getCurrentMember().catch(() => currentMember),
    ]);

    if (
      !latestData.owner?.id ||
      !latestCurrentMember?.id ||
      latestData.owner.id !== latestCurrentMember.id
    ) {
      lastCardJsonRef.current = JSON.stringify(latestData);
      setData(latestData);
      if (latestCurrentMember) setCurrentMember(latestCurrentMember);
      context.notify?.(
        latestData.owner
          ? `Only ${latestData.owner.fullName} can send a handoff for this task.`
          : 'Only the assigned owner of this task can send a handoff.'
      );
      return;
    }

    const newData = buildRequestHandoffData(
      latestData,
      toMember,
      note,
      latestCurrentMember
    );
    if (!newData) {
      context.notify?.('Unable to send handoff request.');
      return;
    }

    await updateCardData(newData);
    context.notify?.(`Handoff requested to ${toMember.fullName}`);
  };

  // P0: Recipient Accepts Handoff
  // Ownership updates to recipient, and handoff is cleared
  const handleAcceptHandoff = async () => {
    const newData = buildAcceptHandoffData(data, currentMember);
    if (!newData) return;

    await updateCardData(newData);
    context.notify?.('Handoff accepted. Primary ownership transferred.');
  };

  // P0: Recipient Declines Handoff
  // Ownership stays with current owner; decline reason recorded in history
  const handleDeclineHandoff = async (reason: string) => {
    const newData = buildDeclineHandoffData(data, reason, currentMember);
    if (!newData) return;

    await updateCardData(newData);
    context.notify?.('Handoff declined and returned to sender.');
  };

  // P0: Sender Cancels Pending Handoff
  const handleCancelHandoff = async () => {
    const newData = buildCancelHandoffData(data, currentMember);
    if (!newData) return;

    await updateCardData(newData);
    context.notify?.('Pending handoff cancelled.');
  };

  // P1: Escalation — Notify Lead & Acknowledge
  const handleNotifyEscalation = async () => {
    const { nextData, didChange } = buildEscalationData(
      data,
      thresholdHours,
      resolvedEscalationContact,
      currentMember,
      { forceRenotify: true }
    );
    if (!didChange) return;

    await updateCardData(nextData);
    context.notify?.(
      resolvedEscalationContact
        ? `Escalation alert sent to ${resolvedEscalationContact.fullName}`
        : 'Escalation flagged in Responsibility History'
    );
  };

  const handleAcknowledgeEscalation = async () => {
    const { nextData, didChange } = buildEscalationData(
      data,
      thresholdHours,
      resolvedEscalationContact,
      currentMember,
      { acknowledge: true }
    );
    if (!didChange) return;

    await updateCardData(nextData);
    context.notify?.('Escalation acknowledged. Primary ownership stays with sender until accepted.');
  };

  if (loading) {
    return (
      <div style={{ padding: '16px', textAlign: 'center', color: '#6B778C', fontSize: '13px' }}>
        Loading TeamSync...
      </div>
    );
  }

  const filteredHistory = data.history.filter((item) => {
    if (historyFilter === 'all') return true;
    if (historyFilter === 'ownership') {
      return item.type === 'owner_assigned' || item.type === 'owner_removed';
    }
    if (historyFilter === 'handoffs') {
      return (
        item.type === 'handoff_requested' ||
        item.type === 'handoff_accepted' ||
        item.type === 'handoff_declined' ||
        item.type === 'handoff_cancelled'
      );
    }
    if (historyFilter === 'escalations') {
      return item.type === 'handoff_escalated';
    }
    return true;
  });

  const visibleHistory = showAllHistory ? filteredHistory : filteredHistory.slice(0, 4);

  return (
    <div className="teamsync-card-section" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* 1. Feature 2 (P0): Primary Task Owner */}
      <OwnerSection
        owner={data.owner}
        members={members}
        currentMember={currentMember}
        onAssignOwner={handleAssignOwner}
        onRemoveOwner={handleRemoveOwner}
      />

      {/* 2. Feature 3 (P0): Structured Task Handoff */}
      <HandoffSection
        handoff={data.handoff}
        owner={data.owner}
        members={members}
        currentMember={currentMember}
        escalationThresholdHours={thresholdHours}
        escalationContact={resolvedEscalationContact}
        onRequestHandoff={handleRequestHandoff}
        onAcceptHandoff={handleAcceptHandoff}
        onDeclineHandoff={handleDeclineHandoff}
        onCancelHandoff={handleCancelHandoff}
        onNotifyEscalation={handleNotifyEscalation}
        onAcknowledgeEscalation={handleAcknowledgeEscalation}
      />

      {/* 3. Feature 4 (P1): Responsibility History Audit Log */}
      <div
        style={{
          backgroundColor: '#ffffff',
          border: '1px solid #DFE1E6',
          borderRadius: '8px',
          padding: '12px 14px',
          boxShadow: '0 1px 2px rgba(9, 30, 66, 0.06)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: data.history.length > 0 ? '8px' : '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '6px', height: '14px', backgroundColor: '#64748B', borderRadius: '2px' }} />
            <span style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: '#5E6C84', letterSpacing: '0.4px' }}>
              Responsibility History ({data.history.length})
            </span>
          </div>

          {filteredHistory.length > 4 && (
            <button
              type="button"
              onClick={() => {
                setShowAllHistory(!showAllHistory);
                setTimeout(() => context.sizeToContent?.(), 50);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#2563EB',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                padding: '2px 4px',
              }}
            >
              {showAllHistory ? 'Show recent' : `Show all (${filteredHistory.length})`}
            </button>
          )}
        </div>

        {data.history.length > 2 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '10px' }}>
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'ownership', label: 'Ownership' },
                { id: 'handoffs', label: 'Handoffs' },
                { id: 'escalations', label: 'Escalations' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setHistoryFilter(f.id)}
                style={{
                  backgroundColor: historyFilter === f.id ? '#EFF6FF' : '#F8FAFC',
                  color: historyFilter === f.id ? '#2563EB' : '#64748B',
                  border: historyFilter === f.id ? '1px solid #BFDBFE' : '1px solid #E2E8F0',
                  borderRadius: '10px',
                  padding: '2px 8px',
                  fontSize: '10px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        {visibleHistory.length === 0 ? (
          <div style={{ fontSize: '12px', color: '#64748B', fontStyle: 'italic' }}>
            {data.history.length === 0
              ? 'No ownership or handoff events recorded yet.'
              : 'No events match this filter.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {visibleHistory.map((item) => {
              const badge = HISTORY_BADGE_COLORS[item.type] || {
                dot: '#64748B',
                bg: '#F1F5F9',
                text: '#475569',
                label: 'Event',
              };
              const fullTs = new Date(item.timestamp).toLocaleString([], {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });
              return (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    fontSize: '12px',
                    paddingBottom: '7px',
                    borderBottom: '1px solid #F1F5F9',
                  }}
                >
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: badge.dot,
                      marginTop: '5px',
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '2px' }}>
                      <span
                        style={{
                          backgroundColor: badge.bg,
                          color: badge.text,
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: '4px',
                        }}
                      >
                        {badge.label}
                      </span>
                      <span
                        title={new Date(item.timestamp).toLocaleString()}
                        style={{ fontSize: '10px', color: '#64748B', fontWeight: 500 }}
                      >
                        {formatExactTimeAgo(item.timestamp)} &bull; {fullTs}
                      </span>
                    </div>
                    <div style={{ color: '#0F172A', fontWeight: 500, lineHeight: 1.35 }}>
                      {item.summary}
                    </div>
                    {item.note && (
                      <div style={{ fontSize: '11px', color: '#475569', fontStyle: 'italic', marginTop: '2px' }}>
                        &ldquo;{item.note}&rdquo;
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
