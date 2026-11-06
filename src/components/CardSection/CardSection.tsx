import React, { useState, useEffect } from 'react';
import type {
  TeamSyncCardData,
  TeamMember,
  ITrelloContext,
} from '../../types/teamsync';
import { OwnerSection } from './OwnerSection';

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

      {/* Feature 3 (P0): Handoff placeholder slot */}
      <div
        style={{
          border: '1px dashed #C1C7D0',
          borderRadius: '8px',
          padding: '12px',
          backgroundColor: '#FAFBFC',
          textAlign: 'center',
          color: '#6B778C',
          fontSize: '12px',
          marginBottom: '10px',
        }}
      >
        <strong>Next up: Feature 3 (P0 Task Handoffs)</strong>
        <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#8993A4' }}>
          Request, accept, or decline handoff with notes without losing primary ownership.
        </p>
      </div>
    </div>
  );
};

