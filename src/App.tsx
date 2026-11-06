import { useState, useEffect } from 'react';
import type { BoardCardSummary } from './types/teamsync';
import { MOCK_MEMBERS } from './trello/mockData';
import {
  getMockStoredCards,
  resetMockData,
  createMockTrelloContext,
  createRealTrelloContext,
  initTrelloConnector,
} from './trello/trelloBridge';
import { CardSection } from './components/CardSection/CardSection';
import { BoardOverview } from './components/Overview/BoardOverview';
import { Avatar } from './components/common/Avatar';
import { Badge } from './components/common/Badge';
import { getComputedTaskStatus } from './utils/statusUtils';
import './App.css';

export function App() {
  const [view, setView] = useState<string>('simulator');
  const [standaloneTab, setStandaloneTab] = useState<'overview' | 'card'>('overview');
  const [cards, setCards] = useState<BoardCardSummary[]>(() => getMockStoredCards());
  const [selectedCardId, setSelectedCardId] = useState<string>(cards[0]?.id || 'card_homepage');
  const [currentMemberId, setCurrentMemberId] = useState<string>('mem_rahul');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view') || 'simulator';
    const inIframe = window.self !== window.top;

    // If running in an iframe inside Trello without explicit view param, default to connector
    const resolvedView = (viewParam === 'simulator' && inIframe) ? 'connector' : viewParam;
    setView(resolvedView);

    if (resolvedView === 'connector') {
      initTrelloConnector();
    }
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleRefresh = () => {
    setCards(getMockStoredCards());
  };

  const handleReset = () => {
    resetMockData();
    setCards(getMockStoredCards());
    showToast('Mock data reset to initial defaults');
  };

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
    let context;
    try {
      context = createRealTrelloContext();
    } catch {
      context = createMockTrelloContext('card_homepage');
    }
    return (
      <div style={{ padding: '8px', background: '#FAFBFC' }}>
        <CardSection context={context} />
      </div>
    );
  }

  // 3. Real Trello Board Modal Overview Iframe View (opened from "TeamSync Overview" board button)
  if (view === 'overview') {
    let context;
    try {
      context = createRealTrelloContext();
    } catch {
      context = createMockTrelloContext(selectedCardId, currentMemberId);
    }
    return (
      <div style={{ padding: '16px', background: '#FAFBFC', minHeight: '100vh' }}>
        <BoardOverview
          context={context}
          onOpenCard={(id) => {
            setSelectedCardId(id);
          }}
        />
      </div>
    );
  }

  // 4. Standalone & Live Testing View (Interactive Wireframe + Card Explorer)
  const selectedCard = cards.find((c) => c.id === selectedCardId) || cards[0];
  const cardContext = createMockTrelloContext(selectedCardId, currentMemberId, () => {
    handleRefresh();
  });
  cardContext.notify = (msg: string) => showToast(msg);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        backgroundColor: '#FAFBFC',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            top: '16px',
            right: '16px',
            backgroundColor: '#172B4D',
            color: '#ffffff',
            padding: '10px 16px',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(9, 30, 66, 0.25)',
            fontSize: '13px',
            fontWeight: 500,
            zIndex: 9999,
          }}
        >
          {toastMessage}
        </div>
      )}

      {/* Top Bar with View Switcher */}
      <header
        style={{
          backgroundColor: '#172B4D',
          padding: '10px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          color: '#ffffff',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span
            style={{
              backgroundColor: '#0052CC',
              color: '#ffffff',
              borderRadius: '4px',
              padding: '2px 8px',
              fontSize: '13px',
              fontWeight: 800,
            }}
          >
            TeamSync
          </span>

          {/* Mode Switcher Tabs */}
          <div style={{ display: 'flex', gap: '4px', backgroundColor: 'rgba(255, 255, 255, 0.1)', padding: '3px', borderRadius: '6px' }}>
            <button
              type="button"
              onClick={() => setStandaloneTab('overview')}
              style={{
                backgroundColor: standaloneTab === 'overview' ? '#ffffff' : 'transparent',
                color: standaloneTab === 'overview' ? '#172B4D' : '#ffffff',
                border: 'none',
                borderRadius: '4px',
                padding: '5px 12px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              📊 Wireframe Overview
            </button>
            <button
              type="button"
              onClick={() => setStandaloneTab('card')}
              style={{
                backgroundColor: standaloneTab === 'card' ? '#ffffff' : 'transparent',
                color: standaloneTab === 'card' ? '#172B4D' : '#ffffff',
                border: 'none',
                borderRadius: '4px',
                padding: '5px 12px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              🎴 Card Back Section
            </button>
          </div>
        </div>

        {/* User Persona Switcher & Reset */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'rgba(255, 255, 255, 0.15)',
              borderRadius: '4px',
              padding: '4px 8px',
            }}
          >
            <span style={{ fontSize: '11px', opacity: 0.9 }}>Simulating User:</span>
            <select
              value={currentMemberId}
              onChange={(e) => setCurrentMemberId(e.target.value)}
              style={{
                backgroundColor: '#ffffff',
                border: 'none',
                borderRadius: '3px',
                padding: '2px 6px',
                fontSize: '12px',
                fontWeight: 600,
                color: '#172B4D',
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
            onClick={handleReset}
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.15)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              padding: '5px 10px',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            Reset Demo Data
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>
        {standaloneTab === 'overview' ? (
          /* Exact Wireframe UI */
          <BoardOverview
            context={cardContext}
            onOpenCard={(cardId) => {
              setSelectedCardId(cardId);
              setStandaloneTab('card');
            }}
          />
        ) : (
          /* Card Back Explorer */
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(280px, 340px) 1fr',
              gap: '16px',
              maxWidth: '1100px',
              margin: '0 auto',
            }}
          >
            {/* Left: Cards List */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: '#5E6C84', marginBottom: '8px' }}>
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
                        border: '1px solid #DFE1E6',
                        cursor: 'pointer',
                        boxShadow: isSelected ? '0 0 0 2px #0052CC' : 'none',
                      }}
                    >
                      <div style={{ fontSize: '10px', fontWeight: 700, color: '#5E6C84', textTransform: 'uppercase', marginBottom: '4px' }}>
                        {c.listName}
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#172B4D', marginBottom: '8px' }}>
                        {c.name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {c.data.owner ? (
                          <div
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              backgroundColor: '#DEEBFF',
                              color: '#0747A6',
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
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right: Card Back Section */}
            <div
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #DFE1E6',
                borderRadius: '10px',
                padding: '20px',
                boxShadow: '0 2px 8px rgba(9, 30, 66, 0.08)',
              }}
            >
              <div style={{ borderBottom: '1px solid #DFE1E6', paddingBottom: '12px', marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', color: '#5E6C84' }}>
                  in list <strong>{selectedCard.listName}</strong>
                </div>
                <h2 style={{ margin: '4px 0 0', fontSize: '20px', fontWeight: 700, color: '#172B4D' }}>
                  {selectedCard.name}
                </h2>
              </div>

              <CardSection
                key={`${selectedCardId}_${currentMemberId}`}
                context={cardContext}
                onDataChange={() => handleRefresh()}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
