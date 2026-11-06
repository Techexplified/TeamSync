import React, { useState, useEffect } from 'react';
import type {
  TeamSyncCardData,
  TeamMember,
  TaskHandoff,
  ITrelloContext,
} from '../../types/teamsync';
import { OwnerSection } from './OwnerSection';
import { HandoffSection } from './HandoffSection';

interface CardSectionProps {
  context: ITrelloContext;
  onDataChange?: (data: TeamSyncCardData) => void;
}

export const CardSection: React.FC<CardSectionProps> = ({ context, onDataChange }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TeamSyncCardData>({
    owner: null,
    handoff: null,
    history: [],
  });
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [currentMember, setCurrentMember] = useState<TeamMember | null>(null);

  const loadData = async () => {
    try {
      const [cardData, memberList, current] = await Promise.all([
        context.getCardData(),
        context.getMembers(),
        context.getCurrentMember(),
      ]);
      setData(cardData);
      setMembers(memberList);
      setCurrentMember(current);
    } catch (e) {
      console.error('Failed to load card data', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const updateCardData = async (newData: TeamSyncCardData) => {
    setData(newData);
    await context.setCardData(newData);
    if (onDataChange) onDataChange(newData);
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
      handoff: null, // Handoff completed, ownership transferred
      history: newHistory,
    };

    await updateCardData(newData);
    context.notify?.(`Handoff accepted. You are now the primary owner.`);
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
        onRequestHandoff={handleRequestHandoff}
        onAcceptHandoff={handleAcceptHandoff}
        onDeclineHandoff={handleDeclineHandoff}
        onCancelHandoff={handleCancelHandoff}
      />

      {/* Feature 4 (P1): Responsibility History placeholder slot */}
      {/* <div
        style={{
          border: '1px dashed #C1C7D0',
          borderRadius: '8px',
          padding: '10px 12px',
          backgroundColor: '#FAFBFC',
          textAlign: 'center',
          color: '#6B778C',
          fontSize: '11px',
        }}
      >
        <strong>Next up: Feature 4 (P1 History & Escalation)</strong> &mdash; Audit trail of all ownership changes, handoffs, and elapsed timers.
      </div> */}
    </div>
  );
};
