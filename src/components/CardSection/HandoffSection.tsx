import React, { useState } from 'react';
import type { TaskHandoff, TaskOwner, TeamMember } from '../../types/teamsync';
import { Avatar } from '../common/Avatar';
import { Badge } from '../common/Badge';
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  XCircleIcon,
  SendIcon,
  ClockIcon,
} from '../common/Icons';
import { formatHoursPending, getHoursPending, DEFAULT_ESCALATION_THRESHOLD_HOURS } from '../../utils/statusUtils';

interface HandoffSectionProps {
  handoff: TaskHandoff | null;
  owner: TaskOwner | null;
  members: TeamMember[];
  currentMember: TeamMember | null;
  escalationThresholdHours?: number;
  onRequestHandoff: (toMember: TeamMember, note: string) => Promise<void>;
  onAcceptHandoff: () => Promise<void>;
  onDeclineHandoff: (reason: string) => Promise<void>;
  onCancelHandoff: () => Promise<void>;
}

export const HandoffSection: React.FC<HandoffSectionProps> = ({
  handoff,
  owner,
  members,
  currentMember,
  escalationThresholdHours = DEFAULT_ESCALATION_THRESHOLD_HOURS,
  onRequestHandoff,
  onAcceptHandoff,
  onDeclineHandoff,
  onCancelHandoff,
}) => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedRecipientId, setSelectedRecipientId] = useState('');
  const [note, setNote] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  const [showDeclineInput, setShowDeclineInput] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isPending = handoff?.status === 'pending';
  const isDeclined = handoff?.status === 'declined';
  const hoursPending = isPending && handoff ? getHoursPending(handoff.createdAt) : 0;
  const isEscalated = isPending && hoursPending >= escalationThresholdHours;
  const isRecipient = handoff && currentMember && handoff.toMember.id === currentMember.id;
  const isSender = handoff && currentMember && handoff.fromMember.id === currentMember.id;

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecipientId) return;
    const recipient = members.find((m) => m.id === selectedRecipientId);
    if (!recipient) return;

    setSubmitting(true);
    try {
      await onRequestHandoff(recipient, note.trim());
      setIsFormOpen(false);
      setSelectedRecipientId('');
      setNote('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAccept = async () => {
    setSubmitting(true);
    try {
      await onAcceptHandoff();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecline = async () => {
    if (!declineReason.trim()) return;
    setSubmitting(true);
    try {
      await onDeclineHandoff(declineReason.trim());
      setShowDeclineInput(false);
      setDeclineReason('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    setSubmitting(true);
    try {
      await onCancelHandoff();
    } finally {
      setSubmitting(false);
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
      {/* Header bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '6px',
              height: '16px',
              backgroundColor: isEscalated ? '#DE350B' : isPending ? '#FFAB00' : isDeclined ? '#BF2600' : '#4C9AFF',
              borderRadius: '2px',
            }}
          />
          <span style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: '#5E6C84', letterSpacing: '0.4px' }}>
            Structured Handoff
          </span>
        </div>

        {isEscalated && <Badge status="needs_attention" label={`Escalated (>${escalationThresholdHours}h)`} />}
        {isPending && !isEscalated && <Badge status="handoff_pending" label="Pending Response" />}
        {isDeclined && <Badge status="needs_owner" label="Handoff Declined" />}
      </div>

      {/* 1. Pending Handoff Card */}
      {isPending && handoff && (
        <div
          style={{
            backgroundColor: isEscalated ? '#FFF5F5' : '#FFFAE6',
            border: isEscalated ? '1px solid #FCA5A5' : '1px solid #FFE380',
            borderRadius: '6px',
            padding: '12px',
          }}
        >
          {isEscalated && (
            <div
              style={{
                backgroundColor: '#FEE2E2',
                border: '1px solid #FCA5A5',
                color: '#991B1B',
                borderRadius: '4px',
                padding: '6px 10px',
                fontSize: '11px',
                fontWeight: 600,
                marginBottom: '10px',
              }}
            >
              Escalation threshold ({escalationThresholdHours}h) exceeded &mdash; primary ownership remains with{' '}
              <strong>{handoff.fromMember.fullName}</strong> until accepted.
            </div>
          )}

          {/* Transfer visual: Sender -> Recipient */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Avatar member={handoff.fromMember} size="sm" showName />
              <ArrowRightIcon size={14} style={{ color: isEscalated ? '#DC2626' : '#B76E00' }} />
              <Avatar member={handoff.toMember} size="sm" showName />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: isEscalated ? '#B91C1C' : '#7A4B00', fontWeight: 600 }}>
              <ClockIcon size={12} />
              {formatHoursPending(hoursPending)}
            </div>
          </div>

          {/* Handoff Note */}
          {handoff.note && (
            <div
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #FFE380',
                borderRadius: '4px',
                padding: '8px 10px',
                fontSize: '12px',
                color: '#172B4D',
                lineHeight: 1.4,
                marginBottom: '10px',
              }}
            >
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#5E6C84', textTransform: 'uppercase', marginBottom: '2px' }}>
                Handoff Context & Note
              </div>
              "{handoff.note}"
            </div>
          )}

          {/* Recipient Action Controls */}
          {isRecipient ? (
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#172B4D', marginBottom: '8px' }}>
                You have been designated as the next owner. Do you accept this task?
              </div>

              {!showDeclineInput ? (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleAccept}
                    style={{
                      flex: 1,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      backgroundColor: '#00875A',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '8px 14px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    <CheckCircle2Icon size={14} />
                    Accept Handoff & Take Ownership
                  </button>

                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => setShowDeclineInput(true)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      backgroundColor: '#ffffff',
                      color: '#BF2600',
                      border: '1px solid #FFBDAD',
                      borderRadius: '4px',
                      padding: '8px 12px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <XCircleIcon size={14} />
                    Decline
                  </button>
                </div>
              ) : (
                <div style={{ marginTop: '6px' }}>
                  <input
                    type="text"
                    placeholder="Provide a reason for declining (required)..."
                    value={declineReason}
                    onChange={(e) => setDeclineReason(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      fontSize: '12px',
                      borderRadius: '4px',
                      border: '1px solid #FFBDAD',
                      backgroundColor: '#ffffff',
                      color: '#172B4D',
                      colorScheme: 'light',
                      boxSizing: 'border-box',
                      marginBottom: '6px',
                    }}
                    autoFocus
                  />
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      disabled={submitting || !declineReason.trim()}
                      onClick={handleDecline}
                      style={{
                        backgroundColor: '#BF2600',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '5px 12px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Confirm Decline
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDeclineInput(false)}
                      style={{
                        backgroundColor: 'transparent',
                        color: '#5E6C84',
                        border: 'none',
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      Back
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : isSender ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
              <span style={{ fontSize: '11px', color: '#7A4B00' }}>
                Waiting for <strong>{handoff.toMember.fullName}</strong> to accept. You remain accountable until accepted.
              </span>
              <button
                type="button"
                disabled={submitting}
                onClick={handleCancel}
                style={{
                  backgroundColor: 'transparent',
                  color: '#6B778C',
                  border: '1px solid #C1C7D0',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                Cancel Handoff
              </button>
            </div>
          ) : (
            <div style={{ fontSize: '11px', color: '#7A4B00' }}>
              Awaiting acceptance by <strong>{handoff.toMember.fullName}</strong>.
            </div>
          )}
        </div>
      )}

      {/* 2. Declined State Card */}
      {isDeclined && handoff && (
        <div
          style={{
            backgroundColor: '#FFEBE6',
            border: '1px solid #FFBDAD',
            borderRadius: '6px',
            padding: '10px 12px',
            marginBottom: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#BF2600' }}>
              Handoff was declined by {handoff.toMember.fullName}
            </span>
            <button
              type="button"
              onClick={() => setIsFormOpen(true)}
              style={{
                backgroundColor: '#0052CC',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Retry Handoff
            </button>
          </div>
          {handoff.declineReason && (
            <div style={{ fontSize: '11px', color: '#172B4D', fontStyle: 'italic', marginTop: '4px' }}>
              Reason: "{handoff.declineReason}"
            </div>
          )}
        </div>
      )}

      {/* 3. Empty State: Initiate Handoff Button */}
      {!isPending && !isFormOpen && (
        <div>
          {owner ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: '#5E6C84' }}>
                Need to transfer responsibility to another teammate?
              </span>
              <button
                type="button"
                onClick={() => setIsFormOpen(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
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
                <ArrowRightIcon size={13} />
                Request Handoff
              </button>
            </div>
          ) : (
            <div style={{ fontSize: '12px', color: '#6B778C', fontStyle: 'italic' }}>
              Assign a primary task owner first to enable handoffs.
            </div>
          )}
        </div>
      )}

      {/* 4. Form: Initiate Handoff */}
      {isFormOpen && (
        <form
          onSubmit={handleFormSubmit}
          style={{
            backgroundColor: '#FAFBFC',
            border: '1px solid #DFE1E6',
            borderRadius: '6px',
            padding: '12px',
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#172B4D', marginBottom: '8px' }}>
            Request Task Handoff
          </div>

          {/* Next Owner Selector */}
          <div style={{ marginBottom: '10px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#5E6C84', marginBottom: '4px' }}>
              Next Accountable Owner (Required)
            </label>
            <select
              required
              value={selectedRecipientId}
              onChange={(e) => setSelectedRecipientId(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 10px',
                fontSize: '12px',
                fontWeight: selectedRecipientId ? 500 : 400,
                borderRadius: '4px',
                border: '1px solid #C1C7D0',
                backgroundColor: '#ffffff',
                color: selectedRecipientId ? '#172B4D' : '#6B778C',
                colorScheme: 'light',
                cursor: 'pointer',
              }}
            >
              <option value="" style={{ backgroundColor: '#ffffff', color: '#6B778C' }}>
                Select recipient teammate...
              </option>
              {members
                .filter((m) => m.id !== owner?.id)
                .map((m) => (
                  <option
                    key={m.id}
                    value={m.id}
                    style={{ backgroundColor: '#ffffff', color: '#172B4D' }}
                  >
                    {m.fullName} {m.role ? `(${m.role})` : ''}
                  </option>
                ))}
            </select>
          </div>

          {/* Context Note */}
          <div style={{ marginBottom: '10px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#5E6C84', marginBottom: '4px' }}>
              Handoff Note & Context (Recommended)
            </label>
            <textarea
              rows={3}
              placeholder="What was completed? What specific next steps or blockers should the recipient know?"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={{
                width: '100%',
                minHeight: '68px',
                padding: '7px 10px',
                fontSize: '12px',
                lineHeight: 1.45,
                borderRadius: '4px',
                border: '1px solid #C1C7D0',
                backgroundColor: '#ffffff',
                color: '#172B4D',
                colorScheme: 'light',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="submit"
              disabled={submitting || !selectedRecipientId}
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
              <SendIcon size={12} />
              Send Handoff Request
            </button>

            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              style={{
                backgroundColor: 'transparent',
                color: '#5E6C84',
                border: 'none',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

