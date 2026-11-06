import type {
  TeamSyncCardData,
  ComputedTaskStatus,
  BoardCardSummary,
} from '../types/teamsync';

export const DEFAULT_ESCALATION_THRESHOLD_HOURS = 24;

/**
 * Calculates hours elapsed since an ISO timestamp
 */
export function getHoursPending(createdAt?: string): number {
  if (!createdAt) return 0;
  const created = new Date(createdAt).getTime();
  const now = Date.now();
  const diffHours = (now - created) / (1000 * 60 * 60);
  return Math.max(0, Math.round(diffHours * 10) / 10);
}

/**
 * Formats elapsed hours into human readable string (e.g. "3h", "1.5d")
 */
export function formatHoursPending(hours: number): string {
  if (hours < 1) return '< 1 hour';
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  const days = Math.floor(hours / 24);
  const remainingHours = Math.floor(hours % 24);
  return remainingHours > 0 ? `${days}d ${remainingHours}h ago` : `${days}d ago`;
}

/**
 * Determines task status matching the wireframe specification
 */
export function getComputedTaskStatus(
  cardData: TeamSyncCardData,
  escalationThresholdHours: number = DEFAULT_ESCALATION_THRESHOLD_HOURS
): ComputedTaskStatus {
  // 1. Unowned / needs owner
  if (!cardData.owner) {
    return 'needs_owner';
  }

  // 2. Handoff pending check
  if (cardData.handoff && cardData.handoff.status === 'pending') {
    const elapsed = getHoursPending(cardData.handoff.createdAt);
    if (elapsed >= escalationThresholdHours) {
      return 'needs_attention';
    }
    return 'handoff_pending';
  }

  // 3. Normal active task
  return 'active';
}

export interface BoardHealthMetrics {
  score: number;
  comment: string;
  unownedCount: number;
  pendingCount: number;
  needsAttentionCount: number;
  activeCount: number;
  totalCards: number;
  summary: string;
}

/**
 * Calculates Board Health Score & Summary for the Wireframe Overview
 */
export function calculateBoardHealth(
  cards: BoardCardSummary[],
  escalationThresholdHours: number = DEFAULT_ESCALATION_THRESHOLD_HOURS
): BoardHealthMetrics {
  const totalCards = cards.length;
  if (totalCards === 0) {
    return {
      score: 100,
      comment: 'No tasks on board',
      unownedCount: 0,
      pendingCount: 0,
      needsAttentionCount: 0,
      activeCount: 0,
      totalCards: 0,
      summary: 'Board is clear. No active handoffs or unassigned cards.',
    };
  }

  let unownedCount = 0;
  let pendingCount = 0;
  let needsAttentionCount = 0;
  let activeCount = 0;

  cards.forEach((card) => {
    const status = getComputedTaskStatus(card.data, escalationThresholdHours);
    if (status === 'needs_owner') unownedCount++;
    else if (status === 'needs_attention') needsAttentionCount++;
    else if (status === 'handoff_pending') pendingCount++;
    else if (status === 'active') activeCount++;
  });

  // Health Score Formula:
  // Starts at 100.
  // Each unowned task docks 10 points.
  // Each overdue/needs_attention handoff docks 15 points.
  // Each normal pending handoff docks 3 points.
  const penalties =
    unownedCount * 10 +
    needsAttentionCount * 15 +
    pendingCount * 3;

  const rawScore = Math.max(10, Math.min(100, 100 - penalties));
  const score = Math.round(rawScore);

  let comment = 'Board in good shape';
  if (needsAttentionCount > 0 && unownedCount > 0) {
    comment = `${needsAttentionCount} overdue handoff${needsAttentionCount > 1 ? 's' : ''} & ${unownedCount} unowned`;
  } else if (needsAttentionCount > 0) {
    comment = `${needsAttentionCount} handoff${needsAttentionCount > 1 ? 's' : ''} waiting >${escalationThresholdHours}h`;
  } else if (unownedCount > 0) {
    comment = `${unownedCount} unowned task${unownedCount > 1 ? 's' : ''} need assignment`;
  } else if (pendingCount > 0) {
    comment = `${pendingCount} handoff${pendingCount > 1 ? 's' : ''} awaiting response`;
  }

  // AI-generated summary snippet
  let summary = 'Task ownership is healthy across the board.';
  if (needsAttentionCount > 0) {
    summary = `Bottleneck detected: ${needsAttentionCount} handoff(s) exceeded the ${escalationThresholdHours}h response threshold and require escalation.`;
  } else if (unownedCount > 0) {
    summary = `${unownedCount} card(s) have no designated owner. Assign primary ownership to prevent delayed starts.`;
  } else if (pendingCount > 0) {
    summary = `${pendingCount} active handoff(s) currently awaiting recipient acceptance.`;
  }

  return {
    score,
    comment,
    unownedCount,
    pendingCount,
    needsAttentionCount,
    activeCount,
    totalCards,
    summary,
  };
}

