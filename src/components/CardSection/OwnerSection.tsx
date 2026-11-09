import React, { useState } from 'react';
import type { TaskOwner, TeamMember } from '../../types/teamsync';
import { Avatar } from '../common/Avatar';
import { Badge } from '../common/Badge';
import {
  UserIcon,
  UserCheckIcon,
  UserPlusIcon,
  AlertCircleIcon,
  ChevronDownIcon,
  SearchIcon,
  CheckIcon,
} from '../common/Icons';

interface OwnerSectionProps {
  owner: TaskOwner | null;
  members: TeamMember[];
  currentMember: TeamMember | null;
  onAssignOwner: (member: TeamMember, options?: { viaClaim?: boolean }) => Promise<void>;
  onRemoveOwner: () => Promise<void>;
}

export const OwnerSection: React.FC<OwnerSectionProps> = ({
  owner,
  members,
  currentMember,
  onAssignOwner,
  onRemoveOwner,
}) => {
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Exclude currently logged-in user from manual assignment list when task has no owner
  const assignableMembers =
    !owner && currentMember
      ? members.filter((m) => m.id !== currentMember.id)
      : members;

  const filteredMembers = assignableMembers.filter((m) =>
    m.fullName.toLowerCase().includes(search.toLowerCase()) ||
    m.role?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = async (member: TeamMember) => {
    // Guardrail: users cannot manually assign an unassigned task to themselves
    if (!owner && currentMember && member.id === currentMember.id) {
      return;
    }

    setIsUpdating(true);
    try {
      await onAssignOwner(member);
      setShowPicker(false);
      setSearch('');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleClaim = async () => {
    if (!currentMember) return;
    setIsUpdating(true);
    try {
      await onAssignOwner(currentMember, { viaClaim: true });
      setShowPicker(false);
      setSearch('');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRemove = async () => {
    setIsUpdating(true);
    try {
      await onRemoveOwner();
      setShowPicker(false);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        border: '1px solid #DFE1E6',
        borderRadius: '8px',
        padding: '14px',
        boxShadow: '0 1px 2px rgba(9, 30, 66, 0.08)',
        marginBottom: '12px',
      }}
    >
      {/* Header bar: Title & Status Badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '6px',
              height: '16px',
              backgroundColor: owner ? '#0052CC' : '#BF2600',
              borderRadius: '2px',
            }}
          />
          <span style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: '#5E6C84', letterSpacing: '0.4px' }}>
            Primary Task Owner (P0)
          </span>
        </div>
        <Badge status={owner ? 'active' : 'needs_owner'} label={owner ? 'Owner Assigned' : 'Needs Owner'} />
      </div>

      {/* Main Owner Card Details */}
      {owner ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ position: 'relative' }}>
              <Avatar member={owner} size="lg" />
              <div
                style={{
                  position: 'absolute',
                  bottom: -2,
                  right: -2,
                  backgroundColor: '#0052CC',
                  borderRadius: '50%',
                  width: '16px',
                  height: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                }}
                title="Designated Accountable Owner"
              >
                <UserCheckIcon size={11} />
              </div>
            </div>

            <div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#172B4D' }}>
                {owner.fullName}
              </div>
              <div style={{ fontSize: '11px', color: '#6B778C', marginTop: '2px' }}>
                Assigned {new Date(owner.assignedAt).toLocaleDateString()}
                {owner.assignedBy && ` by ${owner.assignedBy.fullName}`}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              disabled={isUpdating}
              onClick={() => setShowPicker(!showPicker)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                backgroundColor: '#EBECF0',
                color: '#172B4D',
                border: 'none',
                borderRadius: '4px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <UserIcon size={13} />
              Reassign
              <ChevronDownIcon size={13} />
            </button>
          </div>
        </div>
      ) : (
        /* Unassigned Warning State */
        <div
          style={{
            backgroundColor: '#FFEBE6',
            border: '1px solid #FFBDAD',
            borderRadius: '6px',
            padding: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircleIcon size={18} style={{ color: '#BF2600', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#BF2600' }}>
                No designated task owner
              </div>
              <div style={{ fontSize: '11px', color: '#172B4D', marginTop: '2px' }}>
                Without a single accountable person, handoffs and deliverables are easily missed.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {currentMember && (
              <button
                type="button"
                disabled={isUpdating}
                onClick={handleClaim}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  backgroundColor: '#0052CC',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <UserPlusIcon size={14} />
                Claim Task
              </button>
            )}

            <button
              type="button"
              disabled={isUpdating}
              onClick={() => setShowPicker(!showPicker)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                backgroundColor: '#ffffff',
                color: '#172B4D',
                border: '1px solid #C1C7D0',
                borderRadius: '4px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Assign Member
              <ChevronDownIcon size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Member Selector Dropdown Popover */}
      {showPicker && (
        <div
          style={{
            marginTop: '12px',
            backgroundColor: '#F4F5F7',
            border: '1px solid #DFE1E6',
            borderRadius: '6px',
            padding: '10px',
          }}
        >
          <div style={{ position: 'relative', marginBottom: '8px' }}>
            <input
              type="text"
              placeholder="Search team member..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 8px 6px 28px',
                fontSize: '12px',
                borderRadius: '4px',
                border: '1px solid #C1C7D0',
                boxSizing: 'border-box',
                backgroundColor: '#ffffff',
                color: '#172B4D',
                colorScheme: 'light',
              }}
              autoFocus
            />
            <SearchIcon size={13} style={{ position: 'absolute', left: 8, top: 8, color: '#6B778C' }} />
          </div>

          <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
            {filteredMembers.map((member) => {
              const isSelected = owner?.id === member.id;
              return (
                <div
                  key={member.id}
                  onClick={() => handleSelect(member)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    backgroundColor: isSelected ? '#DEEBFF' : 'transparent',
                    marginBottom: '2px',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = '#EBECF0';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Avatar member={member} size="sm" />
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: '#172B4D' }}>
                        {member.fullName}
                      </div>
                      {member.role && (
                        <div style={{ fontSize: '10px', color: '#6B778C' }}>{member.role}</div>
                      )}
                    </div>
                  </div>

                  {isSelected && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#0052CC', fontSize: '11px', fontWeight: 600 }}>
                      <CheckIcon size={14} /> Current Owner
                    </div>
                  )}
                </div>
              );
            })}

            {filteredMembers.length === 0 && (
              <div style={{ fontSize: '11px', color: '#6B778C', padding: '8px', textAlign: 'center' }}>
                {!owner && assignableMembers.length === 0
                  ? 'No other team members available. Use Claim Task to take ownership.'
                  : 'No members found'}
              </div>
            )}
          </div>

          {owner && (
            <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #DFE1E6', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={handleRemove}
                style={{
                  color: '#BF2600',
                  backgroundColor: 'transparent',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '4px 6px',
                }}
              >
                Clear owner (Mark Unassigned)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

