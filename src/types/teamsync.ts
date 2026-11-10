export interface TeamMember {
  id: string;
  fullName: string;
  username: string;
  avatarUrl?: string | null;
  initials?: string;
  role?: string;
}

export type HandoffStatus = 'none' | 'pending' | 'accepted' | 'declined';

export type TaskPriority = 'High' | 'Medium' | 'Low';

export type TaskLifecycleStatus = 'Overdue' | 'In Progress' | 'Done' | 'To Do';

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
  escalatedAt?: string;
  escalationNotifiedAt?: string;
  escalationNotifiedTo?: {
    id: string;
    fullName: string;
  };
  escalationAcknowledgedAt?: string;
  escalationAcknowledgedBy?: {
    id: string;
    fullName: string;
  };
}

export type HistoryEventType =
  | 'owner_assigned'
  | 'owner_removed'
  | 'handoff_requested'
  | 'handoff_accepted'
  | 'handoff_declined'
  | 'handoff_cancelled'
  | 'handoff_escalated';

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
  meta?: {
    fromMemberName?: string;
    toMemberName?: string;
    escalationContactName?: string;
    responseMs?: number;
  };
}

/**
 * Persisted in Trello card pluginData: t.set('card', 'shared', 'teamsync', data)
 */
export interface TeamSyncCardData {
  owner: TaskOwner | null;
  handoff: TaskHandoff | null;
  history: ResponsibilityHistoryItem[];
  deadline?: string;
  priority?: TaskPriority;
  trelloStatus?: TaskLifecycleStatus;
  handoffLabel?: 'Pending' | 'Not started' | 'In Progress' | 'Completed';
}

/**
 * Computed task status for views and overview tables
 */
export type ComputedTaskStatus =
  | 'active'           // Has owner, no pending handoff
  | 'handoff_pending'  // Handoff requested, waiting for recipient
  | 'needs_owner'      // Unassigned
  | 'needs_attention'; // Pending handoff has exceeded reminder/escalation threshold (e.g. >24h)

export interface TrelloCardLabel {
  id?: string;
  name: string;
  color?: string;
}

export interface BoardCardSummary {
  id: string;
  name: string;
  idList?: string;
  listName: string;
  due?: string | null;
  dueComplete?: boolean;
  url?: string;
  labels?: TrelloCardLabel[];
  trelloMembers?: TeamMember[];
  dateLastActivity?: string;
  data: TeamSyncCardData;
}

export interface BoardInfo {
  id: string;
  name: string;
  isConnected: boolean;
  memberCount: number;
  lastSyncedAt: string;
}

export interface TeamSyncSettings {
  reminderThresholdHours: number;
  escalationThresholdHours: number;
  escalationContactId: string;
}

export interface MockCardUpdatePatch {
  name?: string;
  listName?: string;
  due?: string | null;
  dueComplete?: boolean;
  priority?: TaskPriority;
  trelloStatus?: TaskLifecycleStatus;
}

export interface ITrelloContext {
  getCardData: (cardId?: string) => Promise<TeamSyncCardData>;
  setCardData: (data: TeamSyncCardData, cardId?: string) => Promise<void>;
  getMembers: () => Promise<TeamMember[]>;
  getCurrentMember: () => Promise<TeamMember>;
  getBoardCards?: () => Promise<BoardCardSummary[]>;
  getBoardInfo?: () => Promise<BoardInfo>;
  getSettings?: () => Promise<TeamSyncSettings>;
  saveSettings?: (settings: TeamSyncSettings) => Promise<void>;
  updateCardMeta?: (cardId: string, patch: MockCardUpdatePatch) => Promise<void>;
  openCardInTrello?: (cardId: string) => Promise<void>;
  sizeToContent?: () => void;
  notify?: (message: string) => void;
  isRealTrello?: boolean;
}
