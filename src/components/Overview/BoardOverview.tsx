import React, { useState, useEffect } from 'react';
import type { BoardCardSummary, TeamMember, ITrelloContext, ComputedTaskStatus } from '../../types/teamsync';
import { Avatar } from '../common/Avatar';
import { Badge } from '../common/Badge';
import {
  RefreshCwIcon,
  SearchIcon,
  UserIcon,
} from '../common/Icons';
import { calculateBoardHealth, getComputedTaskStatus, formatHoursPending, getHoursPending } from '../../utils/statusUtils';

interface BoardOverviewProps {
  context: ITrelloContext;
  onOpenCard?: (cardId: string) => void;
}

export const BoardOverview: React.FC<BoardOverviewProps> = ({ context, onOpenCard }) => {
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<BoardCardSummary[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [activeTab, setActiveTab] = useState<'task' | 'team'>('task');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [memberFilter, setMemberFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = async () => {
    setIsRefreshing(true);
    try {
      const [boardCards, memberList] = await Promise.all([
        context.getBoardCards ? context.getBoardCards() : Promise.resolve([]),
        context.getMembers(),
      ]);
      setCards(boardCards);
      setMembers(memberList);
    } catch (e) {
      console.error('Failed to load board overview data', e);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const metrics = calculateBoardHealth(cards);

  // Filter tasks for the table
  const filteredCards = cards.filter((card) => {
    const computedStatus = getComputedTaskStatus(card.data);

    // Status filter
    if (statusFilter !== 'all') {
      if (statusFilter === 'active' && computedStatus !== 'active') return false;
      if (statusFilter === 'handoff_pending' && computedStatus !== 'handoff_pending') return false;
      if (statusFilter === 'needs_owner' && computedStatus !== 'needs_owner') return false;
      if (statusFilter === 'needs_attention' && computedStatus !== 'needs_attention') return false;
    }

    // Member filter
    if (memberFilter !== 'all') {
      if (memberFilter === 'unassigned') {
        if (card.data.owner) return false;
      } else {
        const isOwner = card.data.owner?.id === memberFilter;
        const isHandoffRecipient = card.data.handoff?.toMember.id === memberFilter;
        if (!isOwner && !isHandoffRecipient) return false;
      }
    }

    // Search query
    if (search.trim()) {
      const q = search.toLowerCase();
      const nameMatch = card.name.toLowerCase().includes(q);
      const ownerMatch = card.data.owner?.fullName.toLowerCase().includes(q) || false;
      const recipientMatch = card.data.handoff?.toMember.fullName.toLowerCase().includes(q) || false;
      if (!nameMatch && !ownerMatch && !recipientMatch) return false;
    }

    return true;
  });

  const getStatusDisplay = (status: ComputedTaskStatus) => {
    switch (status) {
      case 'active':
        return 'active';
      case 'handoff_pending':
        return 'handoff pending';
      case 'needs_owner':
        return 'needs owner';
      case 'needs_attention':
        return 'needs attention';
      default:
        return 'active';
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#6B778C', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        Loading TeamSync Overview...
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: '980px',
        margin: '0 auto',
        padding: '20px 24px',
        backgroundColor: '#ffffff',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: '#172B4D',
      }}
    >
      {/* 1. Header: TeamSync : & refresh now */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0, color: '#172B4D' }}>
            TeamSync :
          </h1>
        </div>

        <button
          type="button"
          onClick={loadData}
          disabled={isRefreshing}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: '#ffffff',
            border: '1.5px solid #172B4D',
            borderRadius: '24px',
            padding: '6px 14px',
            fontSize: '12px',
            fontWeight: 700,
            color: '#172B4D',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          title="Refresh board data"
        >
          <RefreshCwIcon
            size={14}
            style={{
              animation: isRefreshing ? 'spin 1s linear infinite' : 'none',
            }}
          />
          <span>refresh now</span>
        </button>
      </div>

      {/* 2. Main Navigation Tabs: Task View (default view) & Team view */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '12px',
          marginBottom: '18px',
        }}
      >
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setActiveTab('task')}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: activeTab === 'task' ? '#0052CC' : '#ffffff',
              color: activeTab === 'task' ? '#ffffff' : '#172B4D',
              border: activeTab === 'task' ? '2px solid #0052CC' : '1.5px solid #172B4D',
              borderRadius: '16px',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              textAlign: 'center',
            }}
          >
            Task View
          </button>
          <span
            style={{
              position: 'absolute',
              bottom: '-18px',
              left: '12px',
              fontSize: '11px',
              fontWeight: 600,
              color: '#5E6C84',
            }}
          >
            ← default view
          </span>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setActiveTab('team')}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: activeTab === 'team' ? '#0052CC' : '#ffffff',
              color: activeTab === 'team' ? '#ffffff' : '#172B4D',
              border: activeTab === 'team' ? '2px solid #0052CC' : '1.5px solid #172B4D',
              borderRadius: '16px',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              textAlign: 'center',
            }}
          >
            Team view
          </button>
        </div>
      </div>

      {/* Spacer below tabs for the default view label */}
      <div style={{ height: '14px' }} />

      {/* 3. Top Intelligence Cards (Health score & AI generated summary) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(280px, 1fr) 1.4fr',
          gap: '12px',
          marginBottom: '14px',
        }}
      >
        {/* Health Score Card */}
        <div
          style={{
            border: '1.5px solid #172B4D',
            borderRadius: '16px',
            padding: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            backgroundColor: '#ffffff',
          }}
        >
          {/* Circular Score Indicator */}
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              border: '3px solid #172B4D',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
              fontWeight: 800,
              color: metrics.score >= 80 ? '#00875A' : metrics.score >= 60 ? '#B76E00' : '#BF2600',
              flexShrink: 0,
            }}
          >
            {metrics.score}
          </div>

          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#172B4D', textTransform: 'lowercase' }}>
              health score :
            </div>
            <div style={{ fontSize: '13px', color: '#5E6C84', marginTop: '4px', fontStyle: 'italic' }}>
              {`{ ${metrics.comment} }`}
            </div>
          </div>
        </div>

        {/* AI Generated Summary Card */}
        <div
          style={{
            border: '1.5px solid #172B4D',
            borderRadius: '16px',
            padding: '16px',
            backgroundColor: '#ffffff',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#172B4D', textTransform: 'lowercase', marginBottom: '6px' }}>
            ai generated summary :
          </div>
          <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.45, color: '#344563' }}>
            {metrics.summary}
          </p>
        </div>
      </div>

      {/* 4. Three Metric Counter Pills */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        {/* Unowned tasks */}
        <div
          onClick={() => setStatusFilter(statusFilter === 'needs_owner' ? 'all' : 'needs_owner')}
          style={{
            border: statusFilter === 'needs_owner' ? '2px solid #BF2600' : '1.5px solid #172B4D',
            borderRadius: '14px',
            padding: '12px 16px',
            backgroundColor: statusFilter === 'needs_owner' ? '#FFEBE6' : '#ffffff',
            cursor: 'pointer',
            textAlign: 'center',
            fontSize: '13px',
            fontWeight: 700,
            color: '#172B4D',
            transition: 'all 0.15s ease',
          }}
        >
          <span style={{ color: '#BF2600', marginRight: '4px' }}>•</span>
          unowned tasks : {metrics.unownedCount}
        </div>

        {/* Pending handoff */}
        <div
          onClick={() => setStatusFilter(statusFilter === 'handoff_pending' ? 'all' : 'handoff_pending')}
          style={{
            border: statusFilter === 'handoff_pending' ? '2px solid #B76E00' : '1.5px solid #172B4D',
            borderRadius: '14px',
            padding: '12px 16px',
            backgroundColor: statusFilter === 'handoff_pending' ? '#FFFAE6' : '#ffffff',
            cursor: 'pointer',
            textAlign: 'center',
            fontSize: '13px',
            fontWeight: 700,
            color: '#172B4D',
            transition: 'all 0.15s ease',
          }}
        >
          pending handoff : {metrics.pendingCount}
        </div>

        {/* Needs attention */}
        <div
          onClick={() => setStatusFilter(statusFilter === 'needs_attention' ? 'all' : 'needs_attention')}
          style={{
            border: statusFilter === 'needs_attention' ? '2px solid #DE350B' : '1.5px solid #172B4D',
            borderRadius: '14px',
            padding: '12px 16px',
            backgroundColor: statusFilter === 'needs_attention' ? '#FFEBE6' : '#ffffff',
            cursor: 'pointer',
            textAlign: 'center',
            fontSize: '13px',
            fontWeight: 700,
            color: '#172B4D',
            transition: 'all 0.15s ease',
          }}
        >
          needs attention : {metrics.needsAttentionCount}
        </div>
      </div>

      {/* 5. Filter Controls Row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <span style={{ fontSize: '13px', fontWeight: 700, color: '#172B4D' }}>
          filter :
        </span>

        {/* Status Dropdown */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            padding: '6px 14px',
            border: '1.5px solid #172B4D',
            borderRadius: '20px',
            backgroundColor: '#ffffff',
            fontSize: '13px',
            fontWeight: 600,
            color: '#172B4D',
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          <option value="all">All Status.</option>
          <option value="active">Active</option>
          <option value="handoff_pending">Handoff Pending</option>
          <option value="needs_owner">Needs Owner</option>
          <option value="needs_attention">Needs Attention</option>
        </select>

        {/* Member Dropdown */}
        <select
          value={memberFilter}
          onChange={(e) => setMemberFilter(e.target.value)}
          style={{
            padding: '6px 14px',
            border: '1.5px solid #172B4D',
            borderRadius: '20px',
            backgroundColor: '#ffffff',
            fontSize: '13px',
            fontWeight: 600,
            color: '#172B4D',
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          <option value="all">All members</option>
          <option value="unassigned">Unassigned</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.fullName}
            </option>
          ))}
        </select>

        {/* Quick Search Filter */}
        <div style={{ position: 'relative', marginLeft: 'auto', minWidth: '180px' }}>
          <input
            type="text"
            placeholder="Search task or owner..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 10px 6px 28px',
              border: '1px solid #DFE1E6',
              borderRadius: '20px',
              fontSize: '12px',
              boxSizing: 'border-box',
            }}
          />
          <SearchIcon size={12} style={{ position: 'absolute', left: 9, top: 9, color: '#6B778C' }} />
        </div>
      </div>

      {/* 6. TAB CONTENT: Task View (The Wireframe Table) */}
      {activeTab === 'task' ? (
        <div style={{ border: '1.5px solid #172B4D', borderRadius: '12px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1.5px solid #172B4D', backgroundColor: '#FAFBFC' }}>
                <th style={{ padding: '12px 18px', fontSize: '13px', fontWeight: 700, color: '#172B4D', width: '40%' }}>
                  task
                </th>
                <th style={{ padding: '12px 18px', fontSize: '13px', fontWeight: 700, color: '#172B4D', width: '30%' }}>
                  owner
                </th>
                <th style={{ padding: '12px 18px', fontSize: '13px', fontWeight: 700, color: '#172B4D', width: '30%' }}>
                  status
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredCards.map((card, idx) => {
                const computedStatus = getComputedTaskStatus(card.data);
                const ownerName = card.data.owner?.fullName || 'unassigned';
                const statusText = getStatusDisplay(computedStatus);

                return (
                  <tr
                    key={card.id}
                    onClick={() => onOpenCard?.(card.id)}
                    style={{
                      borderBottom: idx === filteredCards.length - 1 ? 'none' : '1px solid #DFE1E6',
                      cursor: 'pointer',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F4F5F7')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    {/* Task Name */}
                    <td style={{ padding: '12px 18px', fontSize: '13px', fontWeight: 600, color: '#172B4D' }}>
                      {card.name}
                    </td>

                    {/* Owner */}
                    <td style={{ padding: '12px 18px', fontSize: '13px', color: '#172B4D' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {card.data.owner ? (
                          <Avatar member={card.data.owner} size="sm" />
                        ) : (
                          <span style={{ color: '#BF2600', fontWeight: 600 }}>•</span>
                        )}
                        <span style={{ fontWeight: card.data.owner ? 500 : 400 }}>
                          {ownerName}
                        </span>
                      </div>
                    </td>

                    {/* Status with Badge / Label */}
                    <td style={{ padding: '12px 18px', fontSize: '13px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Badge status={computedStatus} label={statusText} />
                        {card.data.handoff?.status === 'pending' && (
                          <span style={{ fontSize: '11px', color: '#B76E00', fontStyle: 'italic' }}>
                            ({formatHoursPending(getHoursPending(card.data.handoff.createdAt))})
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredCards.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ padding: '32px', textAlign: 'center', color: '#6B778C', fontSize: '13px' }}>
                    No tasks found matching the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* 7. TAB CONTENT: Team View */
        <div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '14px',
            }}
          >
            {members.map((m) => {
              const memberTasks = cards.filter((c) => c.data.owner?.id === m.id);
              const pendingOnMember = cards.filter(
                (c) => c.data.handoff?.status === 'pending' && c.data.handoff?.toMember.id === m.id
              );

              return (
                <div
                  key={m.id}
                  style={{
                    border: '1.5px solid #172B4D',
                    borderRadius: '14px',
                    padding: '16px',
                    backgroundColor: '#ffffff',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Avatar member={m} size="md" />
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#172B4D' }}>
                          {m.fullName}
                        </div>
                        {m.role && <div style={{ fontSize: '11px', color: '#6B778C' }}>{m.role}</div>}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        backgroundColor: '#EBECF0',
                        color: '#172B4D',
                        borderRadius: '12px',
                        padding: '2px 8px',
                      }}
                    >
                      {memberTasks.length} tasks
                    </span>
                  </div>

                  {pendingOnMember.length > 0 && (
                    <div
                      style={{
                        backgroundColor: '#FFFAE6',
                        border: '1px solid #FFE380',
                        borderRadius: '6px',
                        padding: '6px 8px',
                        fontSize: '11px',
                        color: '#B76E00',
                        fontWeight: 600,
                        marginBottom: '8px',
                      }}
                    >
                      ⏳ {pendingOnMember.length} handoff(s) waiting for acceptance
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {memberTasks.map((t) => (
                      <div
                        key={t.id}
                        onClick={() => onOpenCard?.(t.id)}
                        style={{
                          padding: '6px 8px',
                          backgroundColor: '#F4F5F7',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: 500,
                          cursor: 'pointer',
                        }}
                      >
                        {t.name}
                      </div>
                    ))}

                    {memberTasks.length === 0 && (
                      <div style={{ fontSize: '11px', color: '#8993A4', fontStyle: 'italic', padding: '4px 0' }}>
                        No active tasks
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Unassigned Bucket */}
            <div
              style={{
                border: '1.5px dashed #BF2600',
                borderRadius: '14px',
                padding: '16px',
                backgroundColor: '#FFEBE6',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <UserIcon size={18} style={{ color: '#BF2600' }} />
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#BF2600' }}>
                    Unassigned Tasks
                  </span>
                </div>
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    backgroundColor: '#BF2600',
                    color: '#ffffff',
                    borderRadius: '12px',
                    padding: '2px 8px',
                  }}
                >
                  {metrics.unownedCount}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {cards
                  .filter((c) => !c.data.owner)
                  .map((t) => (
                    <div
                      key={t.id}
                      onClick={() => onOpenCard?.(t.id)}
                      style={{
                        padding: '6px 8px',
                        backgroundColor: '#ffffff',
                        border: '1px solid #FFBDAD',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#BF2600',
                        cursor: 'pointer',
                      }}
                    >
                      {t.name}
                    </div>
                  ))}

                {metrics.unownedCount === 0 && (
                  <div style={{ fontSize: '11px', color: '#00875A', fontWeight: 600, padding: '4px 0' }}>
                    All cards have an accountable owner!
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

