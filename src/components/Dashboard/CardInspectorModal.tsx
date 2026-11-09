import React, { useEffect, useMemo } from 'react';
import type {
  BoardCardSummary,
  ITrelloContext,
  TeamMember,
  TeamSyncSettings,
  TaskPriority,
} from '../../types/teamsync';
import { createScopedCardContext } from '../../trello/trelloBridge';
import { CardSection } from '../CardSection/CardSection';
import {
  formatCardDeadline,
  getCardLifecycleStatus,
  getCardPriority,
  isCardCompleted,
  isCardOverdue,
} from '../../utils/statusUtils';

interface CardInspectorModalProps {
  card: BoardCardSummary;
  context: ITrelloContext;
  settings: TeamSyncSettings;
  escalationContact?: TeamMember | null;
  onClose: () => void;
  onUpdated: () => void;
}

export const CardInspectorModal: React.FC<CardInspectorModalProps> = ({
  card,
  context,
  settings,
  escalationContact = null,
  onClose,
  onUpdated,
}) => {
  const scopedContext = useMemo(
    () => createScopedCardContext(context, card.id),
    [context, card.id]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const status = getCardLifecycleStatus(card);
  const priority = getCardPriority(card);
  const completed = isCardCompleted(card);
  const overdue = isCardOverdue(card);
  const deadlineText = formatCardDeadline(card);

  const dueDateInputValue = useMemo(() => {
    if (!card.due) return '';
    const d = new Date(card.due);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  }, [card.due]);

  const handleToggleDone = async () => {
    if (!context.updateCardMeta) return;
    await context.updateCardMeta(card.id, {
      dueComplete: !completed,
      listName: !completed ? 'Done' : card.listName === 'Done' ? 'In Progress' : card.listName,
      trelloStatus: !completed ? 'Done' : 'In Progress',
    });
    onUpdated();
  };

  const handlePriorityChange = async (nextPriority: TaskPriority) => {
    if (!context.updateCardMeta) return;
    await context.updateCardMeta(card.id, { priority: nextPriority });
    onUpdated();
  };

  const handleDueDateChange = async (dateStr: string) => {
    if (!context.updateCardMeta) return;
    if (!dateStr) {
      await context.updateCardMeta(card.id, { due: null });
    } else {
      const parsed = new Date(`${dateStr}T17:00:00`);
      await context.updateCardMeta(card.id, {
        due: Number.isNaN(parsed.getTime()) ? null : parsed.toISOString(),
      });
    }
    onUpdated();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        justifyContent: 'flex-end',
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '520px',
          height: '100%',
          backgroundColor: '#F8FAFC',
          boxShadow: '-8px 0 30px rgba(15, 23, 42, 0.18)',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
        }}
      >
        {/* Top Modal Header */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderBottom: '1px solid #E2E8F0',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '12px',
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
              <span
                style={{
                  backgroundColor: '#F1F5F9',
                  color: '#475569',
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '6px',
                }}
              >
                {card.listName}
              </span>
              <span
                style={{
                  backgroundColor:
                    status === 'Overdue'
                      ? '#FEE2E2'
                      : status === 'Done'
                        ? '#DCFCE7'
                        : status === 'To Do'
                          ? '#F1F5F9'
                          : '#DBEAFE',
                  color:
                    status === 'Overdue'
                      ? '#DC2626'
                      : status === 'Done'
                        ? '#15803D'
                        : status === 'To Do'
                          ? '#475569'
                          : '#2563EB',
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '6px',
                }}
              >
                {status}
              </span>
              <span
                style={{
                  backgroundColor:
                    priority === 'High' ? '#FEF2F2' : priority === 'Low' ? '#ECFDF5' : '#EFF6FF',
                  color:
                    priority === 'High' ? '#B91C1C' : priority === 'Low' ? '#047857' : '#1D4ED8',
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '6px',
                }}
              >
                {priority} Priority
              </span>
            </div>

            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0F172A', lineHeight: 1.3 }}>
              {card.name}
            </h2>
            <div style={{ fontSize: '12px', color: overdue ? '#DC2626' : '#64748B', fontWeight: overdue ? 600 : 500, marginTop: '4px' }}>
              Due: {deadlineText}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            {context.openCardInTrello && (
              <button
                type="button"
                onClick={() => context.openCardInTrello?.(card.id)}
                style={{
                  backgroundColor: '#EFF6FF',
                  color: '#2563EB',
                  border: '1px solid #BFDBFE',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Open in Trello &nearr;
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Close card inspector"
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                backgroundColor: '#ffffff',
                color: '#64748B',
                fontSize: '16px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              &times;
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 20px', flex: 1 }}>
          {/* Native Trello Card Members Hint if unassigned */}
          {card.trelloMembers && card.trelloMembers.length > 0 && !card.data.owner && (
            <div
              style={{
                backgroundColor: '#EFF6FF',
                border: '1px solid #BFDBFE',
                borderRadius: '8px',
                padding: '10px 12px',
                fontSize: '12px',
                color: '#1E40AF',
                marginBottom: '12px',
              }}
            >
              <strong>Trello card members:</strong>{' '}
              {card.trelloMembers.map((m) => m.fullName).join(', ')} &mdash; select one below to designate a single accountable TeamSync owner.
            </div>
          )}

          {/* Simulator Quick Controls (only rendered when mock metadata updates are supported) */}
          {context.updateCardMeta && (
            <div
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #E2E8F0',
                borderRadius: '8px',
                padding: '12px 14px',
                marginBottom: '12px',
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', marginBottom: '8px' }}>
                Task Schedule &amp; Completion (Live Controls)
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={handleToggleDone}
                  style={{
                    backgroundColor: completed ? '#F1F5F9' : '#059669',
                    color: completed ? '#334155' : '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {completed ? 'Reopen Task' : 'Mark Complete'}
                </button>

                <select
                  value={priority}
                  onChange={(e) => handlePriorityChange(e.target.value as TaskPriority)}
                  style={{
                    padding: '5px 8px',
                    fontSize: '12px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#ffffff',
                    color: '#0F172A',
                    colorScheme: 'light',
                  }}
                >
                  <option value="High">High Priority</option>
                  <option value="Medium">Medium Priority</option>
                  <option value="Low">Low Priority</option>
                </select>

                <input
                  type="date"
                  value={dueDateInputValue}
                  onChange={(e) => handleDueDateChange(e.target.value)}
                  style={{
                    padding: '4px 8px',
                    fontSize: '12px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#ffffff',
                    color: '#0F172A',
                    colorScheme: 'light',
                  }}
                  title="Change due date"
                />
              </div>
            </div>
          )}

          {/* Core P0/P1 Owner, Handoff & Audit History Section */}
          <CardSection
            key={card.id}
            context={scopedContext}
            escalationThresholdHours={settings.escalationThresholdHours}
            escalationContact={escalationContact}
            onDataChange={() => onUpdated()}
          />
        </div>
      </div>
    </div>
  );
};

