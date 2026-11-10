import React, { useMemo, useState } from 'react';
import type { BoardCardSummary, TeamMember } from '../../types/teamsync';
import {
  formatCardDeadline,
  formatExactTimeAgo,
  getMemberColor,
  getMemberInitials,
  isCardOverdue,
} from '../../utils/statusUtils';

export type PendingScope = 'all' | 'mine' | 'sent' | 'reminded' | 'escalated';

interface PendingActionsPanelProps {
  cards: BoardCardSummary[];
  currentMember: TeamMember | null;
  escalationContact: TeamMember | null;
  reminderThresholdHours: number;
  escalationThresholdHours: number;
  nowMs: number;
  search: string;
  selectedMember: string;
  scope: PendingScope;
  onScopeChange: (scope: PendingScope) => void;
  onInspectCard: (cardId: string) => void;
  onAcceptHandoff: (card: BoardCardSummary) => Promise<void>;
  onDeclineHandoff: (card: BoardCardSummary, reason: string) => Promise<void>;
  onCancelHandoff: (card: BoardCardSummary) => Promise<void>;
  onSendReminder: (card: BoardCardSummary) => Promise<void>;
  onNotifyEscalation: (card: BoardCardSummary) => Promise<void>;
  onAcknowledgeEscalation: (card: BoardCardSummary) => Promise<void>;
  onOpenSettings?: () => void;
}

export const PendingActionsPanel: React.FC<PendingActionsPanelProps> = ({
  cards,
  currentMember,
  escalationContact,
  reminderThresholdHours,
  escalationThresholdHours,
  nowMs,
  search,
  selectedMember,
  scope,
  onScopeChange,
  onInspectCard,
  onAcceptHandoff,
  onDeclineHandoff,
  onCancelHandoff,
  onSendReminder,
  onNotifyEscalation,
  onAcknowledgeEscalation,
  onOpenSettings,
}) => {
  const [decliningCardId, setDecliningCardId] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [busyCardId, setBusyCardId] = useState<string | null>(null);

  const renderAvatar = (
    member: { fullName?: string; initials?: string; avatarUrl?: string | null } | null | undefined,
    sizePx: number = 24
  ) => {
    if (!member) return null;
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

  const pendingEntries = useMemo(() => {
    return cards
      .filter((c) => c.data.handoff?.status === 'pending')
      .map((card) => {
        const handoff = card.data.handoff!;
        const createdTs = handoff.createdAt ? new Date(handoff.createdAt).getTime() : nowMs;
        const hoursPending = !Number.isNaN(createdTs)
          ? Math.max(0, (nowMs - createdTs) / (1000 * 60 * 60))
          : 0;
        const isEscalated = hoursPending >= escalationThresholdHours;
        const isReminded = !isEscalated && (hoursPending >= reminderThresholdHours || Boolean(handoff.reminderSentAt));
        return { card, handoff, hoursPending, isEscalated, isReminded };
      })
      .sort((a, b) => b.hoursPending - a.hoursPending);
  }, [cards, nowMs, reminderThresholdHours, escalationThresholdHours]);

  const counts = useMemo(() => {
    let mine = 0;
    let sent = 0;
    let reminded = 0;
    let escalated = 0;
    for (const item of pendingEntries) {
      if (currentMember && item.handoff.toMember.id === currentMember.id) mine++;
      if (currentMember && item.handoff.fromMember.id === currentMember.id) sent++;
      if (item.isReminded) reminded++;
      if (item.isEscalated) escalated++;
    }
    return {
      all: pendingEntries.length,
      mine,
      sent,
      reminded,
      escalated,
    };
  }, [pendingEntries, currentMember]);

  const visibleEntries = useMemo(() => {
    return pendingEntries.filter(({ card, handoff, isReminded, isEscalated }) => {
      if (scope === 'mine' && (!currentMember || handoff.toMember.id !== currentMember.id)) {
        return false;
      }
      if (scope === 'sent' && (!currentMember || handoff.fromMember.id !== currentMember.id)) {
        return false;
      }
      if (scope === 'reminded' && !isReminded) {
        return false;
      }
      if (scope === 'escalated' && !isEscalated) {
        return false;
      }

      if (selectedMember === 'unassigned') {
        if (card.data.owner) return false;
      } else if (selectedMember !== 'all') {
        if (
          handoff.fromMember.id !== selectedMember &&
          handoff.toMember.id !== selectedMember
        ) {
          return false;
        }
      }

      if (search.trim()) {
        const q = search.toLowerCase();
        const matchCard = card.name.toLowerCase().includes(q);
        const matchSender = handoff.fromMember.fullName.toLowerCase().includes(q);
        const matchRecip = handoff.toMember.fullName.toLowerCase().includes(q);
        const matchNote = (handoff.note || '').toLowerCase().includes(q);
        if (!matchCard && !matchSender && !matchRecip && !matchNote) return false;
      }

      return true;
    });
  }, [pendingEntries, scope, currentMember, selectedMember, search]);

  const runAction = async (cardId: string, fn: () => Promise<void>) => {
    setBusyCardId(cardId);
    try {
      await fn();
    } finally {
      setBusyCardId(null);
    }
  };

  return (
    <div>
      {/* Pending Scope Header & Mode Switcher */}
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
              { id: 'all' as const, label: `Board-Wide Pending (${counts.all})`, badgeColor: '#F59E0B' },
              {
                id: 'mine' as const,
                label: currentMember
                  ? `Awaiting My Response (${counts.mine})`
                  : `Awaiting Me (${counts.mine})`,
                badgeColor: '#2563EB',
              },
              { id: 'sent' as const, label: `Sent by Me (${counts.sent})`, badgeColor: '#64748B' },
              { id: 'reminded' as const, label: `Reminded >${reminderThresholdHours}h (${counts.reminded})`, badgeColor: '#D97706' },
              { id: 'escalated' as const, label: `Escalated >${escalationThresholdHours}h (${counts.escalated})`, badgeColor: '#DC2626' },
            ] as const
          ).map((tab) => {
            const active = scope === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onScopeChange(tab.id)}
                style={{
                  backgroundColor: active ? '#0F172A' : '#ffffff',
                  color: active ? '#ffffff' : tab.id === 'escalated' && counts.escalated > 0 ? '#B91C1C' : '#334155',
                  border: active ? '1px solid #0F172A' : '1px solid #E2E8F0',
                  borderRadius: '8px',
                  padding: '5px 11px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div style={{ fontSize: '12px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {escalationContact ? (
            <span>
              Escalation Lead: <strong style={{ color: '#0F172A' }}>{escalationContact.fullName}</strong>
            </span>
          ) : (
            onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#2563EB',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                + Designate Escalation Lead
              </button>
            )
          )}
        </div>
      </div>

      {/* Table */}
      <div
        style={{
          border: '1px solid #E2E8F0',
          borderRadius: '10px',
          overflowX: 'auto',
          backgroundColor: '#ffffff',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '720px' }}>
          <thead>
            <tr style={{ backgroundColor: '#F1F5F9', borderBottom: '1px solid #E2E8F0' }}>
              <th style={{ padding: '12px 14px', fontSize: '12px', fontWeight: 700, color: '#475569', width: '24%' }}>
                Card
              </th>
              <th style={{ padding: '12px 14px', fontSize: '12px', fontWeight: 700, color: '#475569', width: '18%' }}>
                Sender (Accountable)
              </th>
              <th style={{ padding: '12px 14px', fontSize: '12px', fontWeight: 700, color: '#475569', width: '18%' }}>
                Recipient
              </th>
              <th style={{ padding: '12px 14px', fontSize: '12px', fontWeight: 700, color: '#475569', width: '18%' }}>
                Time Pending
              </th>
              <th style={{ padding: '12px 14px', fontSize: '12px', fontWeight: 700, color: '#475569', width: '22%' }}>
                Context &amp; Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleEntries.map(({ card, handoff, isReminded, isEscalated }, idx) => {
              const isRecipient = Boolean(currentMember && handoff.toMember.id === currentMember.id);
              const isSender = Boolean(currentMember && handoff.fromMember.id === currentMember.id);
              const isEscalationLead = Boolean(
                currentMember &&
                  (escalationContact?.id || handoff.escalationNotifiedTo?.id) === currentMember.id
              );
              const overdue = isCardOverdue(card);
              const isDeclining = decliningCardId === card.id;
              const isBusy = busyCardId === card.id;

              return (
                <tr
                  key={card.id}
                  style={{
                    borderBottom: idx === visibleEntries.length - 1 ? 'none' : '1px solid #F1F5F9',
                    backgroundColor: isEscalated ? '#FFFBFB' : '#ffffff',
                    verticalAlign: 'top',
                  }}
                >
                  {/* 1. Card */}
                  <td style={{ padding: '12px 14px' }}>
                    <button
                      type="button"
                      onClick={() => onInspectCard(card.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        textAlign: 'left',
                        fontSize: '13px',
                        fontWeight: 700,
                        color: '#0F172A',
                        cursor: 'pointer',
                      }}
                    >
                      {card.name}
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 600,
                          color: '#475569',
                          backgroundColor: '#F1F5F9',
                          padding: '1px 6px',
                          borderRadius: '4px',
                        }}
                      >
                        {card.listName}
                      </span>
                      {(card.due || card.data.deadline) && (
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 600,
                            color: overdue ? '#DC2626' : '#64748B',
                          }}
                        >
                          Due: {formatCardDeadline(card)}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* 2. Sender */}
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {renderAvatar(handoff.fromMember, 24)}
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>
                          {handoff.fromMember.fullName}
                          {isSender && (
                            <span style={{ marginLeft: '5px', fontSize: '10px', color: '#2563EB', fontWeight: 700 }}>
                              (You)
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '10px', color: '#64748B' }}>Holds responsibility</div>
                      </div>
                    </div>
                  </td>

                  {/* 3. Recipient */}
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {renderAvatar(handoff.toMember, 24)}
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>
                          {handoff.toMember.fullName}
                          {isRecipient && (
                            <span
                              style={{
                                marginLeft: '5px',
                                backgroundColor: '#DBEAFE',
                                color: '#1D4ED8',
                                fontSize: '10px',
                                fontWeight: 700,
                                padding: '1px 5px',
                                borderRadius: '4px',
                              }}
                            >
                              You
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '10px', color: isEscalated ? '#DC2626' : '#B45309', fontWeight: 600 }}>
                          Awaiting response
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* 4. Time Pending & Escalation */}
                  <td style={{ padding: '12px 14px' }}>
                    <div
                      title={new Date(handoff.createdAt).toLocaleString()}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        backgroundColor: isEscalated ? '#FEE2E2' : isReminded ? '#FEF3C7' : '#FEF9C3',
                        color: isEscalated ? '#B91C1C' : '#92400E',
                        border: isEscalated ? '1px solid #FCA5A5' : isReminded ? '1px solid #F59E0B' : '1px solid #FDE68A',
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '6px',
                      }}
                    >
                      <span>{isEscalated ? '🚨' : isReminded ? '🔔' : '⏱'}</span>
                      <span>{formatExactTimeAgo(handoff.createdAt, nowMs)}</span>
                    </div>

                    <div style={{ fontSize: '10px', color: '#64748B', marginTop: '4px' }}>
                      Sent {new Date(handoff.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>

                    {isReminded && (
                      <div style={{ fontSize: '10px', fontWeight: 700, color: '#B45309', marginTop: '4px' }}>
                        {handoff.reminderSentAt
                          ? `Reminded ${formatExactTimeAgo(handoff.reminderSentAt, nowMs)}`
                          : `Reminder triggered (>${reminderThresholdHours}h)`}
                      </div>
                    )}

                    {isEscalated && (
                      <div style={{ fontSize: '10px', fontWeight: 700, color: '#991B1B', marginTop: '4px' }}>
                        {handoff.escalationAcknowledgedAt
                          ? `✓ Acknowledged (${escalationContact?.fullName || handoff.escalationNotifiedTo?.fullName || 'Lead'})`
                          : escalationContact || handoff.escalationNotifiedTo
                            ? `Alert → ${escalationContact?.fullName || handoff.escalationNotifiedTo?.fullName}`
                            : `Exceeded ${escalationThresholdHours}h threshold`}
                      </div>
                    )}
                  </td>

                  {/* 5. Note & Inline Actions */}
                  <td style={{ padding: '12px 14px' }}>
                    {handoff.note && (
                      <div
                        style={{
                          fontSize: '11px',
                          color: '#334155',
                          fontStyle: 'italic',
                          backgroundColor: '#F8FAFC',
                          border: '1px solid #E2E8F0',
                          borderRadius: '6px',
                          padding: '5px 8px',
                          marginBottom: '8px',
                          lineHeight: 1.35,
                        }}
                      >
                        &ldquo;{handoff.note}&rdquo;
                      </div>
                    )}

                    {isDeclining ? (
                      <div>
                        <input
                          type="text"
                          placeholder="Reason for declining (required)..."
                          value={declineReason}
                          onChange={(e) => setDeclineReason(e.target.value)}
                          autoFocus
                          style={{
                            width: '100%',
                            padding: '5px 8px',
                            fontSize: '11px',
                            borderRadius: '6px',
                            border: '1px solid #FCA5A5',
                            backgroundColor: '#ffffff',
                            color: '#0F172A',
                            colorScheme: 'light',
                            boxSizing: 'border-box',
                            marginBottom: '6px',
                          }}
                        />
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            type="button"
                            disabled={isBusy || !declineReason.trim()}
                            onClick={() =>
                              runAction(card.id, async () => {
                                await onDeclineHandoff(card, declineReason);
                                setDecliningCardId(null);
                                setDeclineReason('');
                              })
                            }
                            style={{
                              backgroundColor: '#DC2626',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '5px',
                              padding: '4px 8px',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            Confirm Decline
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDecliningCardId(null);
                              setDeclineReason('');
                            }}
                            style={{
                              backgroundColor: '#F1F5F9',
                              color: '#475569',
                              border: 'none',
                              borderRadius: '5px',
                              padding: '4px 8px',
                              fontSize: '11px',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Back
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {isRecipient && (
                          <>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => runAction(card.id, () => onAcceptHandoff(card))}
                              style={{
                                backgroundColor: '#059669',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '6px',
                                padding: '5px 10px',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              Accept
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => {
                                setDecliningCardId(card.id);
                                setDeclineReason('');
                              }}
                              style={{
                                backgroundColor: '#ffffff',
                                color: '#DC2626',
                                border: '1px solid #FCA5A5',
                                borderRadius: '6px',
                                padding: '5px 9px',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              Decline
                            </button>
                          </>
                        )}

                        {isSender && (
                          <>
                            {!isEscalated && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => runAction(card.id, () => onSendReminder(card))}
                                style={{
                                  backgroundColor: '#FFFBEB',
                                  color: '#B45309',
                                  border: '1px solid #FCD34D',
                                  borderRadius: '6px',
                                  padding: '5px 9px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                }}
                              >
                                {handoff.reminderSentAt ? 'Re-remind' : 'Remind'}
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => runAction(card.id, () => onCancelHandoff(card))}
                              style={{
                                backgroundColor: '#DC2626',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '6px',
                                padding: '5px 9px',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              Cancel
                            </button>
                          </>
                        )}

                        {isEscalated && isEscalationLead && !handoff.escalationAcknowledgedAt && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => runAction(card.id, () => onAcknowledgeEscalation(card))}
                            style={{
                              backgroundColor: '#991B1B',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '5px 9px',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            Acknowledge
                          </button>
                        )}

                        {isEscalated && !handoff.escalationAcknowledgedAt && !isEscalationLead && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => runAction(card.id, () => onNotifyEscalation(card))}
                            style={{
                              backgroundColor: '#FEF2F2',
                              color: '#B91C1C',
                              border: '1px solid #FECACA',
                              borderRadius: '6px',
                              padding: '5px 9px',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            Notify Lead
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => onInspectCard(card.id)}
                          style={{
                            backgroundColor: '#EFF6FF',
                            color: '#2563EB',
                            border: '1px solid #BFDBFE',
                            borderRadius: '6px',
                            padding: '5px 9px',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Open Card
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}

            {visibleEntries.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
                  {scope === 'mine'
                    ? 'You have no pending handoffs awaiting your response right now.'
                    : scope === 'sent'
                      ? 'You have no outgoing pending handoffs awaiting a response.'
                      : scope === 'reminded'
                        ? `Zero unanswered handoffs currently at the ${reminderThresholdHours}h reminder stage.`
                        : scope === 'escalated'
                          ? `Zero escalated handoffs exceeding ${escalationThresholdHours}h.`
                          : 'No pending handoffs match the active filters.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
