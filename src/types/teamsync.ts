export interface TeamMember {
  id: string;
  fullName: string;
  username: string;
  avatarUrl?: string | null;
  initials?: string;
  role?: string;
}

export type HandoffStatus = 'none' | 'pending' | 'accepted' | 'declined';

export interface TaskOwner {
  id: string;
  fullName: string;
  username: string;
  avatarUrl?: string | null;
  initials?: string;
  assignedAt: string; // ISO date string
  assignedBy: {
    id: string;
    fullName: string;
  };
}

export interface TaskHandoff {
  id: string;
  fromMember: TeamMember;
  toMember: TeamMember;
  note: string;
  createdAt: string; // ISO date string
  status: HandoffStatus;
  resolvedAt?: string;
  declineReason?: string;
  reminderSentAt?: string;
}

export type HistoryEventType =
  | 'owner_assigned'
  | 'owner_removed'
  | 'handoff_requested'
  | 'handoff_accepted'
  | 'handoff_declined'
  | 'handoff_cancelled';

export interface ResponsibilityHistoryItem {
  id: string;
  type: HistoryEventType;
  actor: {
    id: string;
    fullName: string;
  };
  timestamp: string; // ISO date string
  summary: string;
  note?: string;
}

/**
 * Persisted in Trello card pluginData: t.set('card', 'shared', 'teamsync', data)
 */
export interface TeamSyncCardData {
  owner: TaskOwner | null;
  handoff: TaskHandoff | null;
  history: ResponsibilityHistoryItem[];
}

/**
 * Computed task status for views and overview tables
 */
export type ComputedTaskStatus =
  | 'active'           // Has owner, no pending handoff
  | 'handoff_pending'  // Handoff requested, waiting for recipient
  | 'needs_owner'      // Unassigned
  | 'needs_attention'; // Pending handoff has exceeded reminder/escalation threshold (e.g. >24h)

export interface BoardCardSummary {
  id: string;
  name: string;
  listName: string;
  data: TeamSyncCardData;
}

export interface ITrelloContext {
  getCardData: () => Promise<TeamSyncCardData>;
  setCardData: (data: TeamSyncCardData) => Promise<void>;
  getMembers: () => Promise<TeamMember[]>;
  getCurrentMember: () => Promise<TeamMember>;
  getBoardCards?: () => Promise<BoardCardSummary[]>;
  notify?: (message: string) => void;
  isRealTrello?: boolean;
}

