import { useState, useEffect, useCallback, useMemo } from 'react';
import type { BoardCardSummary, ITrelloContext, TaskPriority } from './types/teamsync';
import { MOCK_MEMBERS } from './trello/mockData';
import {
  addMockCard,
  getMockStoredCards,
  resetMockData,
  createMockTrelloContext,
  createRealTrelloContext,
  initTrelloConnector,
  subscribeToTeamSyncUpdates,
} from './trello/trelloBridge';
import { CardSection } from './components/CardSection/CardSection';
import { TeamSyncDashboard } from './components/Dashboard/TeamSyncDashboard';
import { Avatar } from './components/common/Avatar';
import { Badge } from './components/common/Badge';
import { getComputedTaskStatus } from './utils/statusUtils';
import './App.css';

export function App() {
  const [view] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view') || 'simulator';
    const inIframe = window.self !== window.top;
    // If running in an iframe inside Trello without explicit view param, default to connector
    return viewParam === 'simulator' && inIframe ? 'connector' : viewParam;
  });
  const [standaloneTab, setStandaloneTab] = useState<'overview' | 'card'>('overview');
  const [cards, setCards] = useState<BoardCardSummary[]>(() => getMockStoredCards());
  const [selectedCardId, setSelectedCardId] = useState<string>(cards[0]?.id || 'card_1');
  const [currentMemberId, setCurrentMemberId] = useState<string>('mem_andre');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showAddTaskBar, setShowAddTaskBar] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>('Medium');

  useEffect(() => {
    if (view === 'connector') {
      initTrelloConnector();
    }
  }, [view]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  const handleRefresh = useCallback(() => {
    setCards(getMockStoredCards());
  }, []);

  useEffect(() => {
    return subscribeToTeamSyncUpdates(handleRefresh);
  }, [handleRefresh]);

  const handleReset = useCallback(() => {
    resetMockData();
    const fresh = getMockStoredCards();
    setCards(fresh);
    setSelectedCardId(fresh[0]?.id || 'card_1');
    showToast('Mock board data reset to initial defaults');
  }, [showToast]);

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskName.trim()) return;
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    tomorrow.setHours(17, 0, 0, 0);
    const created = addMockCard(newTaskName.trim(), {
      listName: 'To Do',
      priority: newTaskPriority,
      due: tomorrow.toISOString(),
      ownerId: null,
    });
    setCards(getMockStoredCards());
    setSelectedCardId(created.id);
    setNewTaskName('');
    setShowAddTaskBar(false);
    showToast(`Added "${created.name}" to board`);
  };

  // Real Trello memoized context for trello iframe routes
  const realTrelloContext = useMemo<ITrelloContext | null>(() => {
    if (view !== 'card-back' && view !== 'overview') return null;
    try {
      return createRealTrelloContext();
    } catch {
      return null;
    }
  }, [view]);

  const simulatorContext = useMemo<ITrelloContext>(() => {
    const ctx = createMockTrelloContext(selectedCardId, currentMemberId, handleRefresh);
    ctx.notify = showToast;
    return ctx;
  }, [selectedCardId, currentMemberId, handleRefresh, showToast]);

  // 1. Trello Connector View (runs inside invisible iframe)
  if (view === 'connector') {
    return (
      <div style={{ padding: '12px', color: '#0052CC', fontSize: '12px', fontWeight: 600 }}>
        TeamSync Power-Up Connector Active
      </div>
    );
  }

  // 2. Real Trello Card Back Iframe View
  if (view === 'card-back') {
    const context = realTrelloContext || simulatorContext;
    return (
      <div style={{ padding: '8px', background: '#FAFBFC' }}>
        <CardSection context={context} />
      </div>
    );
  }

  // 3. Real Trello Board Modal Overview Iframe View (opened from "TeamSync Overview" board button)
  if (view === 'overview') {
    const context = realTrelloContext || simulatorContext;
    return (
      <div style={{ padding: '0', background: '#ffffff', minHeight: '100vh' }}>
        {toastMessage && (
          <div
            style={{
              position: 'fixed',
              top: '16px',
              right: '16px',
              backgroundColor: '#0F172A',
              color: '#ffffff',
              padding: '10px 16px',
              borderRadius: '6px',
              boxShadow: '0 4px 12px rgba(15, 23, 42, 0.25)',
              fontSize: '13px',
              fontWeight: 500,
              zIndex: 9999,
            }}
          >
            {toastMessage}
          </div>
        )}
        <TeamSyncDashboard context={context} />
      </div>
    );
  }

  // 4. Standalone & Live Testing View (Interactive Dashboard + Card Explorer)
  const selectedCard = cards.find((c) => c.id === selectedCardId) || cards[0];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        backgroundColor: '#FAFBFC',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            top: '16px',
            right: '16px',
            backgroundColor: '#0F172A',
            color: '#ffffff',
            padding: '10px 16px',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(15, 23, 42, 0.25)',
            fontSize: '13px',
            fontWeight: 500,
            zIndex: 9999,
          }}
        >
          {toastMessage}
        </div>
      )}

      {/* Top Simulator Control Bar */}
      <div
        style={{
          backgroundColor: '#0F172A',
          padding: '8px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          color: '#ffffff',
          fontSize: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, color: '#93C5FD' }}>TeamSync Live Simulator:</span>
          <div style={{ display: 'flex', gap: '4px', backgroundColor: 'rgba(255, 255, 255, 0.1)', padding: '2px', borderRadius: '6px' }}>
            <button
              type="button"
              onClick={() => setStandaloneTab('overview')}
              style={{
                backgroundColor: standaloneTab === 'overview' ? '#2563EB' : 'transparent',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Dashboard View
            </button>
            <button
              type="button"
              onClick={() => setStandaloneTab('card')}
              style={{
                backgroundColor: standaloneTab === 'card' ? '#2563EB' : 'transparent',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Card Back View
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ opacity: 0.8 }}>Logged in as:</span>
            <select
              value={currentMemberId}
              onChange={(e) => setCurrentMemberId(e.target.value)}
              style={{
                backgroundColor: '#1E293B',
                color: '#ffffff',
                colorScheme: 'dark',
                border: '1px solid #334155',
                borderRadius: '4px',
                padding: '2px 6px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {MOCK_MEMBERS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName} ({m.initials})
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => setShowAddTaskBar(!showAddTaskBar)}
            style={{
              backgroundColor: '#2563EB',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              padding: '3px 9px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + Add Task
          </button>

          <button
            type="button"
            onClick={handleReset}
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.12)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              padding: '3px 8px',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            Reset Data
          </button>
        </div>
      </div>

      {/* Inline Simulator Add Task Drawer */}
      {showAddTaskBar && (
        <form
          onSubmit={handleCreateTask}
          style={{
            backgroundColor: '#1E293B',
            color: '#ffffff',
            padding: '10px 20px',
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '8px',
            borderBottom: '1px solid #334155',
          }}
        >
          <input
            type="text"
            placeholder="New task title (creates live unassigned card)..."
            value={newTaskName}
            onChange={(e) => setNewTaskName(e.target.value)}
            autoFocus
            style={{
              flex: '1 1 240px',
              padding: '6px 10px',
              fontSize: '12px',
              borderRadius: '6px',
              border: '1px solid #475569',
              backgroundColor: '#0F172A',
              color: '#ffffff',
              colorScheme: 'dark',
            }}
          />
          <select
            value={newTaskPriority}
            onChange={(e) => setNewTaskPriority(e.target.value as TaskPriority)}
            style={{
              padding: '6px 8px',
              fontSize: '12px',
              borderRadius: '6px',
              border: '1px solid #475569',
              backgroundColor: '#0F172A',
              color: '#ffffff',
              colorScheme: 'dark',
            }}
          >
            <option value="High">High Priority</option>
            <option value="Medium">Medium Priority</option>
            <option value="Low">Low Priority</option>
          </select>
          <button
            type="submit"
            disabled={!newTaskName.trim()}
            style={{
              backgroundColor: '#10B981',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Create Card
          </button>
          <button
            type="button"
            onClick={() => setShowAddTaskBar(false)}
            style={{
              background: 'none',
              color: '#94A3B8',
              border: 'none',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </form>
      )}

      {/* Main View */}
      <main style={{ flex: 1 }}>
        {standaloneTab === 'overview' ? (
          <TeamSyncDashboard
            context={simulatorContext}
            onResetDemoData={handleReset}
          />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(280px, 340px) 1fr',
              gap: '16px',
              maxWidth: '1100px',
              margin: '20px auto',
              padding: '0 20px',
            }}
          >
            {/* Left: Card selection list */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', marginBottom: '8px' }}>
                Cards (Front Badges)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {cards.map((c) => {
                  const isSelected = c.id === selectedCardId;
                  const status = getComputedTaskStatus(c.data);
                  return (
                    <div
                      key={c.id}
                      onClick={() => setSelectedCardId(c.id)}
                      style={{
                        backgroundColor: '#ffffff',
                        borderRadius: '8px',
                        padding: '12px',
                        border: '1px solid #E2E8F0',
                        cursor: 'pointer',
                        boxShadow: isSelected ? '0 0 0 2px #2563EB' : 'none',
                      }}
                    >
                      <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '4px' }}>
                        {c.listName}
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', marginBottom: '8px' }}>
                        {c.name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {c.data.owner ? (
                          <div
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              backgroundColor: '#EFF6FF',
                              color: '#1E40AF',
                              fontSize: '11px',
                              fontWeight: 600,
                              padding: '2px 6px',
                              borderRadius: '4px',
                            }}
                          >
                            <Avatar member={c.data.owner} size="sm" />
                            <span>Owner: {c.data.owner.fullName.split(' ')[0]}</span>
                          </div>
                        ) : (
                          <Badge status={status} />
                        )}
                        {c.data.handoff?.status === 'pending' && (
                          <span
                            style={{
                              backgroundColor: '#FEF3C7',
                              color: '#D97706',
                              fontSize: '10px',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: '4px',
                            }}
                          >
                            ⏳ Handoff
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right: Card back section */}
            {selectedCard && (
              <div
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #E2E8F0',
                  borderRadius: '10px',
                  padding: '20px',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
                }}
              >
                <div style={{ borderBottom: '1px solid #E2E8F0', paddingBottom: '12px', marginBottom: '16px' }}>
                  <div style={{ fontSize: '12px', color: '#64748B' }}>
                    in list <strong>{selectedCard.listName}</strong>
                  </div>
                  <h2 style={{ margin: '4px 0 0', fontSize: '20px', fontWeight: 700, color: '#0F172A' }}>
                    {selectedCard.name}
                  </h2>
                </div>

                <CardSection
                  key={`${selectedCard.id}_${currentMemberId}`}
                  context={simulatorContext}
                  onDataChange={() => handleRefresh()}
                />
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
