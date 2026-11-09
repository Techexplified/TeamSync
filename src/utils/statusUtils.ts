import type {
  TeamSyncCardData,
  ComputedTaskStatus,
  BoardCardSummary,
  TeamMember,
  TeamSyncSettings,
  TaskPriority,
  TaskLifecycleStatus,
} from '../types/teamsync';

export const DEFAULT_ESCALATION_THRESHOLD_HOURS = 24;

export const DEFAULT_SETTINGS: TeamSyncSettings = {
  reminderThresholdHours: 12,
  escalationThresholdHours: DEFAULT_ESCALATION_THRESHOLD_HOURS,
  autoRefreshSeconds: 15,
  escalationContactId: '',
  includeCompletedInHealth: true,
};

/**
 * Computes consistent 2-letter initials from a member's full name.
 */
export function getMemberInitials(name?: string): string {
  if (!name || !name.trim()) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Deterministic rich avatar background color based on initials or full name.
 */
export function getMemberColor(nameOrInitials?: string): string {
  switch (nameOrInitials) {
    case 'AM':
      return '#B45309';
    case 'RK':
      return '#92400E';
    case 'MS':
      return '#0369A1';
    case 'AP':
      return '#7C3AED';
    case 'NT':
      return '#0F766E';
    default: {
      if (!nameOrInitials) return '#475569';
      const palette = ['#2563EB', '#7C3AED', '#B45309', '#0F766E', '#BE123C', '#4338CA', '#0369A1'];
      let hash = 0;
      for (let i = 0; i < nameOrInitials.length; i++) {
        hash = nameOrInitials.charCodeAt(i) + ((hash << 5) - hash);
      }
      return palette[Math.abs(hash) % palette.length];
    }
  }
}

/**
 * Calculates hours elapsed since an ISO timestamp
 */
export function getHoursPending(createdAt?: string): number {
  if (!createdAt) return 0;
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return 0;
  const now = Date.now();
  const diffHours = (now - created) / (1000 * 60 * 60);
  return Math.max(0, Math.round(diffHours * 10) / 10);
}

/**
 * Formats elapsed hours into human readable string (e.g. "3h ago", "1d 4h ago")
 */
export function formatHoursPending(hours: number): string {
  if (hours < 1) return '< 1 hour';
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  const days = Math.floor(hours / 24);
  const remainingHours = Math.floor(hours % 24);
  return remainingHours > 0 ? `${days}d ${remainingHours}h ago` : `${days}d ago`;
}

/**
 * Short compact duration for compact table badges (e.g. "28h", "2d")
 */
export function formatCompactHours(hours: number): string {
  if (hours < 1) return '<1h';
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = Math.floor(hours / 24);
  const rem = Math.round(hours % 24);
  return rem > 0 ? `${days}d ${rem}h` : `${days}d`;
}

/**
 * Formats relative sync time for header status tooltip / badges
 */
export function formatRelativeSyncTime(isoTimestamp?: string): string {
  if (!isoTimestamp) return 'just now';
  const ts = new Date(isoTimestamp).getTime();
  if (Number.isNaN(ts)) return 'just now';
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 10) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ago`;
}

/**
 * Determines whether a card is completed based on Trello dueComplete, explicit status, or list name.
 */
export function isCardCompleted(card: BoardCardSummary): boolean {
  if (card.dueComplete === true) return true;
  if (card.data.trelloStatus === 'Done') return true;
  if (card.listName && /\b(done|completed|complete|shipped|released|finished|closed)\b/i.test(card.listName)) {
    return true;
  }
  return false;
}

/**
 * Determines whether a card is genuinely overdue in real time.
 */
export function isCardOverdue(card: BoardCardSummary): boolean {
  if (isCardCompleted(card)) return false;
  if (card.due) {
    const dueTs = new Date(card.due).getTime();
    if (!Number.isNaN(dueTs)) {
      return dueTs < Date.now();
    }
  }
  return card.data.trelloStatus === 'Overdue';
}

/**
 * Checks whether the card's due date falls on today's local calendar date.
 */
export function isCardDueToday(card: BoardCardSummary): boolean {
  if (!card.due) return false;
  const d = new Date(card.due);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/**
 * Checks whether a card matches a selected deadline filter preset.
 */
export function matchesDeadlineFilter(card: BoardCardSummary, filter: string): boolean {
  if (filter === 'all') return true;
  if (filter === 'overdue') return isCardOverdue(card);
  if (filter === 'today') return isCardDueToday(card);
  if (filter === 'none') return !card.due && !card.data.deadline;

  if (!card.due) return false;
  const dueTs = new Date(card.due).getTime();
  if (Number.isNaN(dueTs)) return false;

  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  if (filter === 'week') {
    return !isCardCompleted(card) && dueTs >= now && dueTs <= now + sevenDaysMs;
  }
  if (filter === 'upcoming') {
    return !isCardCompleted(card) && dueTs >= now;
  }

  return formatCardDeadline(card) === filter;
}

/**
 * Returns sortable numeric deadline timestamp (undated tasks sort last in ascending mode).
 */
export function getCardDeadlineTimestamp(card: BoardCardSummary): number {
  if (card.due) {
    const ts = new Date(card.due).getTime();
    if (!Number.isNaN(ts)) return ts;
  }
  return Number.MAX_SAFE_INTEGER;
}

/**
 * Formats card deadline for clean table/card rendering (e.g., "Nov 6", "Today", or "No deadline").
 */
export function formatCardDeadline(card: BoardCardSummary): string {
  if (card.due) {
    const d = new Date(card.due);
    if (!Number.isNaN(d.getTime())) {
      const now = new Date();
      const sameYear = d.getFullYear() === now.getFullYear();
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        ...(sameYear ? {} : { year: 'numeric' }),
      });
    }
  }
  return card.data.deadline || 'No deadline';
}

/**
 * Derives card priority from explicit pluginData or Trello labels.
 */
export function getCardPriority(card: BoardCardSummary): TaskPriority {
  if (card.data.priority) return card.data.priority;
  if (card.labels && card.labels.length > 0) {
    for (const label of card.labels) {
      const name = (label.name || '').toLowerCase();
      const color = (label.color || '').toLowerCase();
      if (/high|urgent|critical|p0|blocker|asap/.test(name) || color === 'red') {
        return 'High';
      }
      if (/low|minor|p2|p3|nice/.test(name) || color === 'green' || color === 'sky') {
        return 'Low';
      }
    }
  }
  return 'Medium';
}

/**
 * Derives live task lifecycle status shown in the Dashboard Status pill.
 */
export function getCardLifecycleStatus(card: BoardCardSummary): TaskLifecycleStatus {
  if (isCardCompleted(card)) return 'Done';
  if (isCardOverdue(card)) return 'Overdue';

  if (
    card.data.trelloStatus === 'To Do' ||
    (!card.data.trelloStatus && card.listName && /\b(to\s*do|backlog|icebox|queue|upcoming)\b/i.test(card.listName))
  ) {
    return 'To Do';
  }

  return 'In Progress';
}

export interface HandoffDisplayInfo {
  state: 'pending' | 'escalated' | 'declined' | 'in_progress' | 'completed' | 'not_started';
  label: string;
  tooltip: string;
  hoursPending: number;
}

/**
 * Computes handoff column presentation with live elapsed timer and escalation status.
 */
export function getCardHandoffDisplay(
  card: BoardCardSummary,
  escalationThresholdHours: number = DEFAULT_ESCALATION_THRESHOLD_HOURS
): HandoffDisplayInfo {
  const handoff = card.data.handoff;

  if (handoff?.status === 'pending') {
    const hours = getHoursPending(handoff.createdAt);
    const escalated = hours >= escalationThresholdHours;
    const recipient = handoff.toMember?.fullName || 'Teammate';
    return {
      state: escalated ? 'escalated' : 'pending',
      label: escalated ? `Pending (${formatCompactHours(hours)})` : 'Pending',
      tooltip: escalated
        ? `Escalated: Handoff to ${recipient} waiting ${formatHoursPending(hours)} (>${escalationThresholdHours}h threshold). Owner stays accountable until accepted.`
        : `Handoff requested to ${recipient} (${formatHoursPending(hours)}). Waiting for acceptance.`,
      hoursPending: hours,
    };
  }

  if (handoff?.status === 'declined') {
    return {
      state: 'declined',
      label: 'Declined',
      tooltip: `Declined by ${handoff.toMember?.fullName || 'recipient'}${handoff.declineReason ? `: "${handoff.declineReason}"` : ''}`,
      hoursPending: 0,
    };
  }

  if (isCardCompleted(card)) {
    return {
      state: 'completed',
      label: 'Completed',
      tooltip: 'Task completed.',
      hoursPending: 0,
    };
  }

  const hasAcceptedHistory = card.data.history?.some((h) => h.type === 'handoff_accepted');
  if (card.data.handoffLabel === 'In Progress' || hasAcceptedHistory) {
    return {
      state: 'in_progress',
      label: 'In Progress',
      tooltip: hasAcceptedHistory
        ? 'Handoff accepted and actively progressing.'
        : 'Work in active handoff cycle.',
      hoursPending: 0,
    };
  }

  return {
    state: 'not_started',
    label: 'Not started',
    tooltip: card.data.owner
      ? 'No active handoff requested yet.'
      : 'Assign a primary owner before initiating a handoff.',
    hoursPending: 0,
  };
}

/**
 * Determines TeamSync accountability status matching P0/P1 guardrails.
 */
export function getComputedTaskStatus(
  cardData: TeamSyncCardData,
  escalationThresholdHours: number = DEFAULT_ESCALATION_THRESHOLD_HOURS
): ComputedTaskStatus {
  if (!cardData.owner) {
    return 'needs_owner';
  }

  if (cardData.handoff && cardData.handoff.status === 'pending') {
    const elapsed = getHoursPending(cardData.handoff.createdAt);
    if (elapsed >= escalationThresholdHours) {
      return 'needs_attention';
    }
    return 'handoff_pending';
  }

  return 'active';
}

export interface DashboardMetrics {
  totalTasks: number;
  pendingTasks: number;
  overdueTasks: number;
  pendingHandoffs: number;
  escalatedHandoffs: number;
  unownedTasks: number;
  completedTasks: number;
  healthScore: number;
  healthLabel: 'Strong' | 'Moderate' | 'At Risk';
  healthColor: string;
}

/**
 * Real-time KPI and Team Health Score calculation from live board cards.
 */
export function computeDashboardMetrics(
  cards: BoardCardSummary[],
  settings: TeamSyncSettings = DEFAULT_SETTINGS
): DashboardMetrics {
  const totalTasks = cards.length;

  let pendingTasks = 0;
  let overdueTasks = 0;
  let pendingHandoffs = 0;
  let escalatedHandoffs = 0;
  let unownedTasks = 0;
  let completedTasks = 0;

  for (const card of cards) {
    const done = isCardCompleted(card);
    if (done) {
      completedTasks++;
    } else {
      pendingTasks++;
      if (!card.data.owner) {
        unownedTasks++;
      }
      if (isCardOverdue(card)) {
        overdueTasks++;
      }
    }

    if (card.data.handoff?.status === 'pending') {
      pendingHandoffs++;
      const hrs = getHoursPending(card.data.handoff.createdAt);
      if (hrs >= settings.escalationThresholdHours) {
        escalatedHandoffs++;
      }
    }
  }

  let healthScore = 100;
  if (totalTasks > 0) {
    const denominator = settings.includeCompletedInHealth ? totalTasks : Math.max(1, pendingTasks);
    const overduePenalty = (overdueTasks / denominator) * 52;
    const unownedPenalty = (unownedTasks / denominator) * 42;
    const escalatedPenalty = escalatedHandoffs * 5.5;
    const waitingHandoffPenalty = Math.max(0, pendingHandoffs - escalatedHandoffs) * 1.5;

    const totalPenalty = overduePenalty + unownedPenalty + escalatedPenalty + waitingHandoffPenalty;
    healthScore = Math.max(10, Math.min(100, Math.round(100 - totalPenalty)));
  }

  let healthLabel: 'Strong' | 'Moderate' | 'At Risk' = 'Strong';
  let healthColor = '#10B981';
  if (healthScore < 55) {
    healthLabel = 'At Risk';
    healthColor = '#EF4444';
  } else if (healthScore < 80) {
    healthLabel = 'Moderate';
    healthColor = '#F59E0B';
  }

  return {
    totalTasks,
    pendingTasks,
    overdueTasks,
    pendingHandoffs,
    escalatedHandoffs,
    unownedTasks,
    completedTasks,
    healthScore,
    healthLabel,
    healthColor,
  };
}

/**
 * Generates real-time AI Summary bullet points directly from live board cards & metrics.
 * `variant` cycles perspective slightly when user clicks "Regenerate" while keeping every stat truthful.
 */
export function generateRealtimeAiSummary(
  cards: BoardCardSummary[],
  members: TeamMember[],
  metrics: DashboardMetrics,
  settings: TeamSyncSettings,
  variant: number = 0
): string[] {
  if (cards.length === 0) {
    return [
      'No open tasks were found on this board yet.',
      'Add cards to Trello lists and assign primary owners in TeamSync to start tracking handoffs.',
      `Team health is at ${metrics.healthScore}% with zero bottlenecks detected.`,
    ];
  }

  const overdueCards = cards.filter((c) => isCardOverdue(c));
  const pendingHandoffCards = cards.filter((c) => c.data.handoff?.status === 'pending');
  const unownedCards = cards.filter((c) => !c.data.owner && !isCardCompleted(c));
  const dueTodayCards = cards.filter((c) => !isCardCompleted(c) && !isCardOverdue(c) && isCardDueToday(c));

  const formatNames = (list: BoardCardSummary[]) => {
    const shown = list.slice(0, 3).map((c) => c.name);
    return list.length > 3 ? `${shown.join(', ')}, and ${list.length - 3} more` : shown.join(', ');
  };

  // Determine most common handoff flow path (using list or member roles)
  const flowCounts: Record<string, number> = {};
  let oldestPendingCard: BoardCardSummary | null = null;
  let oldestHours = -1;

  for (const c of pendingHandoffCards) {
    const ho = c.data.handoff!;
    const fromLabel =
      members.find((m) => m.id === ho.fromMember.id)?.role?.split(' ')[0] ||
      ho.fromMember.fullName.split(' ')[0];
    const toLabel =
      members.find((m) => m.id === ho.toMember.id)?.role?.split(' ')[0] ||
      ho.toMember.fullName.split(' ')[0];
    const flow = `${fromLabel} -> ${toLabel}`;
    flowCounts[flow] = (flowCounts[flow] || 0) + 1;

    const hrs = getHoursPending(ho.createdAt);
    if (hrs > oldestHours) {
      oldestHours = hrs;
      oldestPendingCard = c;
    }
  }

  const topFlow = Object.entries(flowCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

  // Calculate busiest owner load among pending tasks
  const ownerLoad: Record<string, { name: string; count: number }> = {};
  for (const c of cards) {
    if (!isCardCompleted(c) && c.data.owner) {
      const id = c.data.owner.id;
      if (!ownerLoad[id]) ownerLoad[id] = { name: c.data.owner.fullName, count: 0 };
      ownerLoad[id].count++;
    }
  }
  const topOwner = Object.values(ownerLoad).sort((a, b) => b.count - a.count)[0];

  const mode = variant % 3;

  // Bullet 1: Deadlines / Schedule risk
  let bullet1: string;
  if (overdueCards.length > 0) {
    if (mode === 1 && dueTodayCards.length > 0) {
      bullet1 = `${overdueCards.length} task${overdueCards.length > 1 ? 's are' : ' is'} overdue (${formatNames(overdueCards)}), and ${dueTodayCards.length} more due today.`;
    } else {
      bullet1 = `${overdueCards.length} task${overdueCards.length > 1 ? 's are' : ' is'} overdue (${formatNames(overdueCards)}).`;
    }
  } else if (dueTodayCards.length > 0) {
    bullet1 = `Zero overdue tasks right now; ${dueTodayCards.length} task${dueTodayCards.length > 1 ? 's are' : ' is'} due today (${formatNames(dueTodayCards)}).`;
  } else {
    bullet1 = `All ${metrics.pendingTasks} active tasks are on schedule with zero missed deadlines.`;
  }

  // Bullet 2: Handoffs & Unowned Accountability
  let bullet2: string;
  if (pendingHandoffCards.length > 0) {
    if (mode === 2 && oldestPendingCard) {
      const ho = oldestPendingCard.data.handoff!;
      const escalatedTxt =
        metrics.escalatedHandoffs > 0
          ? ` (${metrics.escalatedHandoffs} exceeded ${settings.escalationThresholdHours}h threshold)`
          : '';
      bullet2 = `${pendingHandoffCards.length} pending handoff${pendingHandoffCards.length > 1 ? 's' : ''}${escalatedTxt}; oldest is "${oldestPendingCard.name}" (${ho.fromMember.fullName} -> ${ho.toMember.fullName}, ${formatCompactHours(oldestHours)}).`;
    } else {
      const flowNote = topFlow ? `, led by ${topFlow}` : '';
      const escNote =
        metrics.escalatedHandoffs > 0
          ? ` — ${metrics.escalatedHandoffs} waiting >${settings.escalationThresholdHours}h`
          : '';
      bullet2 = `${pendingHandoffCards.length} task${pendingHandoffCards.length > 1 ? 's are' : ' is'} pending handoff${flowNote}${escNote}.`;
    }
  } else if (unownedCards.length > 0) {
    bullet2 = `${unownedCards.length} active task${unownedCards.length > 1 ? 's lack' : ' lacks'} a primary owner (${formatNames(unownedCards)}).`;
  } else {
    bullet2 = `Zero blocked handoffs; all ${metrics.pendingTasks} active tasks have confirmed primary accountability.`;
  }

  // Bullet 3: Overall Health & Focus Recommendation
  let bullet3: string;
  if (mode === 1 && unownedCards.length > 0) {
    bullet3 = `Team health is ${metrics.healthScore}% (${metrics.healthLabel.toLowerCase()}): assign owners to ${formatNames(unownedCards)} to eliminate accountability blind spots.`;
  } else if (mode === 2 && topOwner) {
    bullet3 = `Team health stands at ${metrics.healthScore}% across ${metrics.completedTasks}/${metrics.totalTasks} completed tasks (${topOwner.name} carries the highest active load: ${topOwner.count} tasks).`;
  } else if (metrics.healthScore >= 80) {
    bullet3 = `Overall team health is strong at ${metrics.healthScore}%, with ${metrics.completedTasks} of ${metrics.totalTasks} tasks completed and most work on track.`;
  } else if (metrics.healthScore >= 55) {
    bullet3 = `Team health is moderate at ${metrics.healthScore}% (${metrics.overdueTasks} overdue, ${metrics.unownedTasks} unassigned, ${metrics.escalatedHandoffs} escalated handoffs).`;
  } else {
    bullet3 = `Team health is at risk (${metrics.healthScore}%): prioritize clearing ${metrics.overdueTasks} overdue tasks and ${metrics.escalatedHandoffs} escalated handoffs.`;
  }

  return [bullet1, bullet2, bullet3];
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
 * Calculates Board Health Score & Summary (legacy BoardOverview compatibility)
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

  const penalties = unownedCount * 10 + needsAttentionCount * 15 + pendingCount * 3;
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
