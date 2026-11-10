import React, { useState } from 'react';
import type { BoardCardSummary, TeamMember, TeamSyncSettings } from '../../types/teamsync';
import { DEFAULT_SETTINGS, getHoursPending } from '../../utils/statusUtils';

interface SettingsPanelProps {
  settings: TeamSyncSettings;
  members: TeamMember[];
  cards: BoardCardSummary[];
  isRealTrello: boolean;
  onSaveSettings: (next: TeamSyncSettings) => Promise<void>;
  onResetBoardDemo?: () => void;
  onBackToDashboard: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  settings,
  members,
  cards,
  isRealTrello,
  onSaveSettings,
  onResetBoardDemo,
  onBackToDashboard,
}) => {
  const [draft, setDraft] = useState<TeamSyncSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [savedBanner, setSavedBanner] = useState(false);

  const previewEscalatedCount = cards.filter(
    (c) => c.data.handoff?.status === 'pending' && getHoursPending(c.data.handoff.createdAt) >= draft.escalationThresholdHours
  ).length;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSaveSettings({
        reminderThresholdHours: Math.max(1, Number(draft.reminderThresholdHours) || 12),
        escalationThresholdHours: Math.max(1, Number(draft.escalationThresholdHours) || 24),
        escalationContactId: draft.escalationContactId || '',
      });
      setSavedBanner(true);
      setTimeout(() => setSavedBanner(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = async () => {
    setDraft(DEFAULT_SETTINGS);
    setSaving(true);
    try {
      await onSaveSettings(DEFAULT_SETTINGS);
      setSavedBanner(true);
      setTimeout(() => setSavedBanner(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, margin: 0, color: '#0F172A', letterSpacing: '-0.3px' }}>
            Power-Up Settings
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748B' }}>
            Configure escalation thresholds and accountability defaults for this board.
          </p>
        </div>

        <button
          type="button"
          onClick={onBackToDashboard}
          style={{
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: '8px',
            padding: '7px 14px',
            fontSize: '12px',
            fontWeight: 600,
            color: '#334155',
            cursor: 'pointer',
          }}
        >
          &larr; Back to Dashboard
        </button>
      </div>

      {savedBanner && (
        <div
          style={{
            backgroundColor: '#ECFDF5',
            border: '1px solid #A7F3D0',
            color: '#065F46',
            borderRadius: '10px',
            padding: '10px 14px',
            fontSize: '13px',
            fontWeight: 600,
            marginBottom: '16px',
          }}
        >
          Settings saved and synced to {isRealTrello ? 'Trello board shared storage' : 'local board storage'}.
        </div>
      )}

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Section 1: Handoff & Escalation Rules */}
        <div
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid #E2E8F0',
            borderRadius: '12px',
            padding: '18px 20px',
          }}
        >
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
            Handoff & Escalation Thresholds
          </div>
          <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '16px' }}>
            Pending handoffs retain accountability on the current owner until accepted. Exceeding the escalation window flags the card across board badges and KPIs.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
            {/* Reminder Threshold */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Reminder Threshold (hours)
              </label>
              <input
                type="number"
                min={1}
                max={168}
                value={draft.reminderThresholdHours}
                onChange={(e) => setDraft({ ...draft, reminderThresholdHours: Number(e.target.value) })}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  fontSize: '13px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#ffffff',
                  color: '#0F172A',
                  colorScheme: 'light',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                {[6, 12, 24].map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setDraft({ ...draft, reminderThresholdHours: h })}
                    style={{
                      padding: '2px 8px',
                      fontSize: '11px',
                      fontWeight: 600,
                      borderRadius: '6px',
                      border: '1px solid #E2E8F0',
                      backgroundColor: draft.reminderThresholdHours === h ? '#EFF6FF' : '#F8FAFC',
                      color: draft.reminderThresholdHours === h ? '#2563EB' : '#64748B',
                      cursor: 'pointer',
                    }}
                  >
                    {h}h
                  </button>
                ))}
              </div>
            </div>

            {/* Escalation Threshold */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Escalation Flag Threshold (hours)
              </label>
              <input
                type="number"
                min={1}
                max={336}
                value={draft.escalationThresholdHours}
                onChange={(e) => setDraft({ ...draft, escalationThresholdHours: Number(e.target.value) })}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  fontSize: '13px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#ffffff',
                  color: '#0F172A',
                  colorScheme: 'light',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px', gap: '6px' }}>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {[12, 24, 48].map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setDraft({ ...draft, escalationThresholdHours: h })}
                      style={{
                        padding: '2px 8px',
                        fontSize: '11px',
                        fontWeight: 600,
                        borderRadius: '6px',
                        border: '1px solid #E2E8F0',
                        backgroundColor: draft.escalationThresholdHours === h ? '#FEF2F2' : '#F8FAFC',
                        color: draft.escalationThresholdHours === h ? '#DC2626' : '#64748B',
                        cursor: 'pointer',
                      }}
                    >
                      {h}h
                    </button>
                  ))}
                </div>
                <span style={{ fontSize: '11px', color: previewEscalatedCount > 0 ? '#DC2626' : '#059669', fontWeight: 600 }}>
                  {previewEscalatedCount} currently flagged
                </span>
              </div>
            </div>
          </div>

          {/* Escalation Contact */}
          <div style={{ marginTop: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              Escalation Lead / Sprint Owner
            </label>
            <select
              value={draft.escalationContactId}
              onChange={(e) => setDraft({ ...draft, escalationContactId: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 10px',
                fontSize: '13px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#ffffff',
                color: '#0F172A',
                colorScheme: 'light',
              }}
            >
              <option value="">No specific escalation contact (flag board only)</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName} {m.role ? `(${m.role})` : m.username ? `(@${m.username})` : ''}
                </option>
              ))}
            </select>
            <div style={{ fontSize: '11px', color: '#64748B', marginTop: '6px' }}>
              When a pending handoff exceeds {draft.escalationThresholdHours}h, this contact receives dashboard &amp; card-level escalation alerts and can acknowledge escalations.
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginTop: '4px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={handleResetDefaults}
              disabled={saving}
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #E2E8F0',
                borderRadius: '8px',
                padding: '8px 14px',
                fontSize: '12px',
                fontWeight: 600,
                color: '#475569',
                cursor: 'pointer',
              }}
            >
              Reset Defaults
            </button>
            {!isRealTrello && onResetBoardDemo && (
              <button
                type="button"
                onClick={onResetBoardDemo}
                style={{
                  backgroundColor: '#FEF2F2',
                  border: '1px solid #FECACA',
                  borderRadius: '8px',
                  padding: '8px 14px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#DC2626',
                  cursor: 'pointer',
                }}
              >
                Reset Sample Board Data
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={saving}
            style={{
              backgroundColor: '#2563EB',
              border: 'none',
              borderRadius: '8px',
              padding: '9px 20px',
              fontSize: '13px',
              fontWeight: 700,
              color: '#ffffff',
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(37, 99, 235, 0.25)',
            }}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
};
