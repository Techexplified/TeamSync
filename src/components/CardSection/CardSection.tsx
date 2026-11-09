import React, { useState, useEffect } from 'react';
import type {
  TeamSyncCardData,
  TeamMember,
  TaskHandoff,
  HistoryEventType,
  ITrelloContext,
} from '../../types/teamsync';
import { OwnerSection } from './OwnerSection';
import { HandoffSection } from './HandoffSection';
import { DEFAULT_ESCALATION_THRESHOLD_HOURS } from '../../utils/statusUtils';

interface CardSectionProps {
  context: ITrelloContext;
  escalationThresholdHours?: number;
  onDataChange?: (data: TeamSyncCardData) => void;
}

const HISTORY_BADGE_COLORS: Record<HistoryEventType, { dot: string; label: string }> = {
  owner_assigned: { dot: '#2563EB', label: 'Owner' },
  owner_removed: { dot: '#DC2626', label: 'Unassigned' },
  handoff_requested: { dot: '#D97706', label: 'Handoff' },
  handoff_accepted: { dot: '#059669', label: 'Accepted' },
  handoff_declined: { dot: '#DC2626', label: 'Declined' },
  handoff_cancelled: { dot: '#64748B', label: 'Cancelled' },
};

export const CardSection: React.FC<CardSectionProps> = ({
  context,
  escalationThresholdHours,
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
  const [showAllHistory, setShowAllHistory] = useState(false);

  const thresholdHours = escalationThresholdHours ?? loadedThresholdHours;

  useEffect(() => {
    let active = true;
    Promise.all([
      context.getCardData(),
      context.getMembers(),
      context.getCurrentMember(),
      context.getSettings ? context.getSettings() : Promise.resolve(null),
    ])
      .then(([cardData, memberList, current, settings]) => {
        if (!active) return;
        setData(cardData);
        setMembers(memberList);
        setCurrentMember(current);
        if (settings) {
          setLoadedThresholdHours(settings.escalationThresholdHours);
        }
      })
      .catch((e) => {
        console.error('Failed to load card data', e);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
        setTimeout(() => context.sizeToContent?.(), 50);
      });

    return () => {
      active = false;
    };
  }, [context]);

  const updateCardData = async (newData: TeamSyncCardData) => {
    setData(newData);
    await context.setCardData(newData);
    if (onDataChange) onDataChange(newData);
    setTimeout(() => context.sizeToContent?.(), 50);
  };

  // P0: Assign or Reassign Primary Owner
  const handleAssignOwner = async (member: TeamMember) => {
    const actor = currentMember || member;
    const now = new Date().toISOString();
    const isReassignment = !!data.owner;

    const summary = isReassignment
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
    context.notify?.(`Primary owner assigned to ${member.fullName}`);
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
  // Guardrail: Owner remains unchanged until recipient explicitly accepts!
  const handleRequestHandoff = async (toMember: TeamMember, note: string) => {
    if (!data.owner) return;
    const actor = currentMember || data.owner;
    const now = new Date().toISOString();

    const handoff: TaskHandoff = {
      id: `ho_${Date.now()}`,
      fromMember: {
        id: data.owner.id,
        fullName: data.owner.fullName,
        username: data.owner.username,
        avatarUrl: data.owner.avatarUrl,
        initials: data.owner.initials,
      },
      toMember,
      note,
      createdAt: now,
      status: 'pending',
    };

    const newHistory = [
      {
        id: `hist_${Date.now()}`,
        type: 'handoff_requested' as const,
        actor: { id: actor.id, fullName: actor.fullName },
        timestamp: now,
        summary: `${actor.fullName} requested handoff to ${toMember.fullName}`,
        note: note || undefined,
      },
      ...data.history,
    ];

    const newData: TeamSyncCardData = {
      ...data,
      handoff,
      handoffLabel: 'Pending',
      history: newHistory,
    };

    await updateCardData(newData);
    context.notify?.(`Handoff requested to ${toMember.fullName}`);
  };

  // P0: Recipient Accepts Handoff
  // Ownership updates to recipient, and handoff is cleared
  const handleAcceptHandoff = async () => {
    if (!data.handoff) return;
    const recipient = data.handoff.toMember;
    const sender = data.handoff.fromMember;
    const now = new Date().toISOString();

    const newHistory = [
      {
        id: `hist_${Date.now()}`,
        type: 'handoff_accepted' as const,
        actor: { id: recipient.id, fullName: recipient.fullName },
        timestamp: now,
        summary: `${recipient.fullName} accepted the handoff and assumed primary ownership`,
      },
      ...data.history,
    ];

    const newData: TeamSyncCardData = {
      ...data,
      owner: {
        id: recipient.id,
        fullName: recipient.fullName,
        username: recipient.username,
        avatarUrl: recipient.avatarUrl,
        initials: recipient.initials,
        assignedAt: now,
        assignedBy: { id: sender.id, fullName: sender.fullName },
      },
      handoff: null,
      handoffLabel: 'In Progress',
      history: newHistory,
    };

    await updateCardData(newData);
    context.notify?.('Handoff accepted. Primary ownership transferred.');
  };

  // P0: Recipient Declines Handoff
  // Ownership stays with current owner; decline reason recorded in history
  const handleDeclineHandoff = async (reason: string) => {
    if (!data.handoff) return;
    const recipient = currentMember || data.handoff.toMember;
    const now = new Date().toISOString();

    const newHistory = [
      {
        id: `hist_${Date.now()}`,
        type: 'handoff_declined' as const,
        actor: { id: recipient.id, fullName: recipient.fullName },
        timestamp: now,
        summary: `${recipient.fullName} declined handoff from ${data.handoff.fromMember.fullName}`,
        note: reason,
      },
      ...data.history,
    ];

    const newData: TeamSyncCardData = {
      ...data,
      handoff: {
        ...data.handoff,
        status: 'declined',
        resolvedAt: now,
        declineReason: reason,
      },
      handoffLabel: 'Not started',
      history: newHistory,
    };

    await updateCardData(newData);
    context.notify?.('Handoff declined and returned to sender.');
  };

  // P0: Sender Cancels Pending Handoff
  const handleCancelHandoff = async () => {
    if (!data.handoff) return;
    const actor = currentMember || { id: 'unknown', fullName: 'User' };
    const now = new Date().toISOString();

    const newHistory = [
      {
        id: `hist_${Date.now()}`,
        type: 'handoff_cancelled' as const,
        actor: { id: actor.id, fullName: actor.fullName },
        timestamp: now,
        summary: `${actor.fullName} cancelled the pending handoff`,
      },
      ...data.history,
    ];

    const newData: TeamSyncCardData = {
      ...data,
      handoff: null,
      handoffLabel: 'Not started',
      history: newHistory,
    };

    await updateCardData(newData);
    context.notify?.('Pending handoff cancelled.');
  };

  if (loading) {
    return (
      <div style={{ padding: '16px', textAlign: 'center', color: '#6B778C', fontSize: '13px' }}>
        Loading TeamSync...
      </div>
    );
  }

  const visibleHistory = showAllHistory ? data.history : data.history.slice(0, 4);

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
        onRequestHandoff={handleRequestHandoff}
        onAcceptHandoff={handleAcceptHandoff}
        onDeclineHandoff={handleDeclineHandoff}
        onCancelHandoff={handleCancelHandoff}
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: data.history.length > 0 ? '10px' : '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '6px', height: '14px', backgroundColor: '#64748B', borderRadius: '2px' }} />
            <span style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: '#5E6C84', letterSpacing: '0.4px' }}>
              Responsibility History ({data.history.length})
            </span>
          </div>

          {data.history.length > 4 && (
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
              {showAllHistory ? 'Show recent' : `Show all (${data.history.length})`}
            </button>
          )}
        </div>

        {data.history.length === 0 ? (
          <div style={{ fontSize: '12px', color: '#64748B', fontStyle: 'italic' }}>
            No ownership or handoff events recorded yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {visibleHistory.map((item) => {
              const badge = HISTORY_BADGE_COLORS[item.type] || { dot: '#64748B', label: 'Event' };
              return (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    fontSize: '12px',
                    paddingBottom: '6px',
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
                    <div style={{ color: '#0F172A', fontWeight: 500, lineHeight: 1.35 }}>
                      {item.summary}
                    </div>
                    {item.note && (
                      <div style={{ fontSize: '11px', color: '#475569', fontStyle: 'italic', marginTop: '2px' }}>
                        &ldquo;{item.note}&rdquo;
                      </div>
                    )}
                    <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '2px' }}>
                      {new Date(item.timestamp).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
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
