import React, { useMemo, useState } from 'react';
import type {
  BoardCardSummary,
  HistoryEventType,
  ResponsibilityHistoryItem,
  TeamMember,
} from '../../types/teamsync';
import { formatExactTimeAgo } from '../../utils/statusUtils';

export type HistoryCategoryFilter = 'all' | 'ownership' | 'requests' | 'responses' | 'escalations';

interface BoardHistoryEntry {
  cardId: string;
  cardName: string;
  listName: string;
  item: ResponsibilityHistoryItem;
}

interface HistoryFeedPanelProps {
  cards: BoardCardSummary[];
  members: TeamMember[];
  nowMs: number;
  search: string;
  selectedMember: string;
  boardName: string;
  onInspectCard: (cardId: string) => void;
}

const EVENT_BADGE_MAP: Record<
  HistoryEventType,
  { dot: string; bg: string; text: string; label: string }
> = {
  owner_assigned: { dot: '#2563EB', bg: '#EFF6FF', text: '#1D4ED8', label: 'Owner Assigned' },
  owner_removed: { dot: '#DC2626', bg: '#FEE2E2', text: '#B91C1C', label: 'Unassigned' },
  handoff_requested: { dot: '#D97706', bg: '#FEF3C7', text: '#B45309', label: 'Handoff Sent' },
  handoff_accepted: { dot: '#059669', bg: '#DCFCE7', text: '#047857', label: 'Accepted' },
  handoff_declined: { dot: '#DC2626', bg: '#FEE2E2', text: '#B91C1C', label: 'Declined' },
  handoff_cancelled: { dot: '#64748B', bg: '#F1F5F9', text: '#475569', label: 'Cancelled' },
  handoff_escalated: { dot: '#991B1B', bg: '#FEF2F2', text: '#991B1B', label: 'Escalated' },
};

export const HistoryFeedPanel: React.FC<HistoryFeedPanelProps> = ({
  cards,
  members,
  nowMs,
  search,
  selectedMember,
  boardName,
  onInspectCard,
}) => {
  const [category, setCategory] = useState<HistoryCategoryFilter>('all');
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);

  const allEntries = useMemo<BoardHistoryEntry[]>(() => {
    const entries: BoardHistoryEntry[] = [];
    for (const card of cards) {
      const history = card.data.history || [];
      for (const item of history) {
        entries.push({
          cardId: card.id,
          cardName: card.name,
          listName: card.listName,
          item,
        });
      }
    }
    return entries.sort((a, b) => {
      const ta = new Date(a.item.timestamp).getTime();
      const tb = new Date(b.item.timestamp).getTime();
      return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
    });
  }, [cards]);

  const counts = useMemo(() => {
    let ownership = 0;
    let requests = 0;
    let responses = 0;
    let escalations = 0;

    for (const { item } of allEntries) {
      if (item.type === 'owner_assigned' || item.type === 'owner_removed') ownership++;
      else if (item.type === 'handoff_requested') requests++;
      else if (
        item.type === 'handoff_accepted' ||
        item.type === 'handoff_declined' ||
        item.type === 'handoff_cancelled'
      ) {
        responses++;
      } else if (item.type === 'handoff_escalated') {
        escalations++;
      }
    }

    return {
      all: allEntries.length,
      ownership,
      requests,
      responses,
      escalations,
    };
  }, [allEntries]);

  const memberById = useMemo(() => {
    const map = new Map<string, TeamMember>();
    for (const m of members) map.set(m.id, m);
    return map;
  }, [members]);

  const filteredEntries = useMemo(() => {
    return allEntries.filter(({ cardName, listName, item }) => {
      if (category === 'ownership' && item.type !== 'owner_assigned' && item.type !== 'owner_removed') {
        return false;
      }
      if (category === 'requests' && item.type !== 'handoff_requested') {
        return false;
      }
      if (
        category === 'responses' &&
        item.type !== 'handoff_accepted' &&
        item.type !== 'handoff_declined' &&
        item.type !== 'handoff_cancelled'
      ) {
        return false;
      }
      if (category === 'escalations' && item.type !== 'handoff_escalated') {
        return false;
      }

      if (selectedMember !== 'all' && selectedMember !== 'unassigned') {
        const targetMember = memberById.get(selectedMember);
        const matchesActor = item.actor.id === selectedMember;
        const matchesName = targetMember
          ? item.summary.toLowerCase().includes(targetMember.fullName.toLowerCase())
          : false;
        if (!matchesActor && !matchesName) return false;
      }

      if (search.trim()) {
        const q = search.toLowerCase();
        const matchCard = cardName.toLowerCase().includes(q) || listName.toLowerCase().includes(q);
        const matchSummary = item.summary.toLowerCase().includes(q);
        const matchActor = item.actor.fullName.toLowerCase().includes(q);
        const matchNote = (item.note || '').toLowerCase().includes(q);
        if (!matchCard && !matchSummary && !matchActor && !matchNote) return false;
      }

      return true;
    });
  }, [allEntries, category, selectedMember, memberById, search]);

  const handleExportHistoryCsv = () => {
    const headers = ['Timestamp', 'Event Type', 'Card', 'List', 'Actor', 'Summary', 'Note'];
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;

    const rows = filteredEntries.map(({ cardName, listName, item }) => [
      esc(item.timestamp),
      esc(EVENT_BADGE_MAP[item.type]?.label || item.type),
      esc(cardName),
      esc(listName),
      esc(item.actor.fullName),
      esc(item.summary),
      esc(item.note || ''),
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeBoard = boardName.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'Board';
    link.href = url;
    link.download = `TeamSync_${safeBoard}_Responsibility_History.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setExportFeedback(`Exported ${filteredEntries.length} events`);
    setTimeout(() => setExportFeedback(null), 2500);
  };

  return (
    <div>
      {/* Top Category Filter & Export Row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
          backgroundColor: '#F8FAFC',
          border: '1px solid #E2E8F0',
          borderRadius: '10px',
          padding: '10px 14px',
          marginBottom: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
          {(
            [
              { id: 'all' as const, label: `All Events (${counts.all})` },
              { id: 'ownership' as const, label: `Ownership Changes (${counts.ownership})` },
              { id: 'requests' as const, label: `Handoff Requests (${counts.requests})` },
              { id: 'responses' as const, label: `Accept / Decline (${counts.responses})` },
              { id: 'escalations' as const, label: `Escalations (${counts.escalations})` },
            ] as const
          ).map((chip) => {
            const active = category === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => setCategory(chip.id)}
                style={{
                  backgroundColor: active ? '#0F172A' : '#ffffff',
                  color: active
                    ? '#ffffff'
                    : chip.id === 'escalations' && counts.escalations > 0
                      ? '#991B1B'
                      : '#334155',
                  border: active ? '1px solid #0F172A' : '1px solid #E2E8F0',
                  borderRadius: '8px',
                  padding: '5px 10px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {chip.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={handleExportHistoryCsv}
          disabled={filteredEntries.length === 0}
          style={{
            backgroundColor: exportFeedback ? '#ECFDF5' : '#ffffff',
            border: exportFeedback ? '1px solid #A7F3D0' : '1px solid #CBD5E1',
            color: exportFeedback ? '#065F46' : '#334155',
            borderRadius: '8px',
            padding: '5px 11px',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {exportFeedback || 'Export History CSV'}
        </button>
      </div>

      {/* Audit Timeline List */}
      <div
        style={{
          backgroundColor: '#ffffff',
          border: '1px solid #E2E8F0',
          borderRadius: '10px',
          overflow: 'hidden',
        }}
      >
        {filteredEntries.length === 0 ? (
          <div style={{ padding: '36px 20px', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
            {allEntries.length === 0
              ? 'No responsibility history events have been recorded on this board yet.'
              : 'No responsibility history events match the current filter.'}
          </div>
        ) : (
          <div>
            {filteredEntries.map(({ cardId, cardName, listName, item }, idx) => {
              const badge = EVENT_BADGE_MAP[item.type] || {
                dot: '#64748B',
                bg: '#F1F5F9',
                text: '#475569',
                label: 'Event',
              };
              const dateText = new Date(item.timestamp).toLocaleString([], {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={`${cardId}_${item.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '12px 16px',
                    borderBottom: idx === filteredEntries.length - 1 ? 'none' : '1px solid #F1F5F9',
                  }}
                >
                  <span
                    style={{
                      width: '9px',
                      height: '9px',
                      borderRadius: '50%',
                      backgroundColor: badge.dot,
                      marginTop: '6px',
                      flexShrink: 0,
                    }}
                  />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '8px',
                        marginBottom: '4px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                        <span
                          style={{
                            backgroundColor: badge.bg,
                            color: badge.text,
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '2px 7px',
                            borderRadius: '5px',
                          }}
                        >
                          {badge.label}
                        </span>

                        <button
                          type="button"
                          onClick={() => onInspectCard(cardId)}
                          style={{
                            backgroundColor: '#F1F5F9',
                            color: '#0F172A',
                            border: 'none',
                            borderRadius: '5px',
                            padding: '2px 8px',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                          title={`Inspect card "${cardName}"`}
                        >
                          {cardName} &bull; <span style={{ color: '#64748B', fontWeight: 500 }}>{listName}</span>
                        </button>
                      </div>

                      <div
                        title={new Date(item.timestamp).toLocaleString()}
                        style={{ fontSize: '11px', color: '#64748B', fontWeight: 500, flexShrink: 0 }}
                      >
                        {formatExactTimeAgo(item.timestamp, nowMs)} &bull; {dateText}
                      </div>
                    </div>

                    <div style={{ fontSize: '13px', fontWeight: 500, color: '#0F172A', lineHeight: 1.4 }}>
                      {item.summary}
                    </div>

                    {item.note && (
                      <div
                        style={{
                          marginTop: '4px',
                          fontSize: '12px',
                          color: '#475569',
                          fontStyle: 'italic',
                          backgroundColor: '#F8FAFC',
                          borderLeft: '2px solid #CBD5E1',
                          padding: '4px 8px',
                          borderRadius: '0 4px 4px 0',
                        }}
                      >
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

