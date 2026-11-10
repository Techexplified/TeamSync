import type {
  TeamSyncCardData,
  TeamMember,
  BoardCardSummary,
  BoardInfo,
  TeamSyncSettings,
  MockCardUpdatePatch,
  TaskPriority,
  ITrelloContext,
} from '../types/teamsync';
import { MOCK_MEMBERS, INITIAL_MOCK_CARDS } from './mockData';
import { DEFAULT_SETTINGS, getMemberInitials } from '../utils/statusUtils';

declare global {
  interface Window {
    TrelloPowerUp?: {
      initialize: (capabilities: Record<string, unknown>) => void;
      iframe: (options?: Record<string, unknown>) => TrelloIframe;
    };
  }
}

export interface TrelloIframe {
  get: (scope: string, visibility: string, key: string) => Promise<unknown>;
  set: (scope: string, visibility: string, key: string, value: unknown) => Promise<void>;
  card: (...fields: string[]) => Promise<{ id: string; name: string; idMembers?: string[] }>;
  board: (...fields: string[]) => Promise<{
    id: string;
    name?: string;
    members?: Array<{ id: string; fullName: string; username: string; avatar?: string }>;
  }>;
  cards: (...fields: string[]) => Promise<
    Array<{
      id: string;
      name: string;
      idList?: string;
      due?: string | null;
      dueComplete?: boolean;
      closed?: boolean;
      url?: string;
      dateLastActivity?: string;
      labels?: Array<{ id?: string; name?: string; color?: string }>;
      members?: Array<{ id: string; fullName: string; username: string; avatar?: string }>;
    }>
  >;
  lists?: (...fields: string[]) => Promise<Array<{ id: string; name: string }>>;
  member: (...fields: string[]) => Promise<{ id: string; fullName: string; username: string; avatar?: string }>;
  showCard?: (cardId: string) => Promise<void>;
  sizeTo?: (selector: string | HTMLElement) => void;
  closeModal?: () => void;
  modal?: (options: Record<string, unknown>) => void;
  alert?: (options: { message: string; duration?: number }) => void;
  signUrl?: (url: string) => string;
}

export const STORAGE_KEY = 'teamsync_v2_cards';
export const SETTINGS_STORAGE_KEY = 'teamsync_v2_settings';
const SYNC_CHANNEL_NAME = 'teamsync_realtime_sync';

function formatTrelloAvatar(avatar?: string): string | null {
  if (!avatar) return null;
  if (/\.(png|jpg|jpeg|webp|gif)$/i.test(avatar)) return avatar;
  return `${avatar}/50.png`;
}

function normalizeCardData(raw: unknown): TeamSyncCardData {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Partial<TeamSyncCardData>;
  return {
    owner: obj.owner || null,
    handoff: obj.handoff || null,
    history: Array.isArray(obj.history) ? obj.history : [],
    ...(obj.deadline !== undefined ? { deadline: obj.deadline } : {}),
    ...(obj.priority !== undefined ? { priority: obj.priority } : {}),
    ...(obj.trelloStatus !== undefined ? { trelloStatus: obj.trelloStatus } : {}),
    ...(obj.handoffLabel !== undefined ? { handoffLabel: obj.handoffLabel } : {}),
  };
}

export function broadcastTeamSyncChange(reason: string = 'data_updated') {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel(SYNC_CHANNEL_NAME);
      ch.postMessage({ type: reason, timestamp: Date.now() });
      ch.close();
    }
  } catch {
    // BroadcastChannel unavailable in restricted contexts; ignore safely
  }
}

export function subscribeToTeamSyncUpdates(callback: () => void): () => void {
  const handleStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === SETTINGS_STORAGE_KEY) {
      callback();
    }
  };
  window.addEventListener('storage', handleStorage);

  let channel: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(SYNC_CHANNEL_NAME);
      channel.onmessage = () => callback();
    }
  } catch {
    channel = null;
  }

  return () => {
    window.removeEventListener('storage', handleStorage);
    if (channel) {
      channel.close();
    }
  };
}

export function getMockStoredCards(): BoardCardSummary[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('Failed to read from localStorage', e);
  }
  return INITIAL_MOCK_CARDS;
}

export function saveMockStoredCards(cards: BoardCardSummary[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
    broadcastTeamSyncChange('mock_cards_saved');
  } catch (e) {
    console.error('Failed to write to localStorage', e);
  }
}

function normalizeSettings(raw: unknown): TeamSyncSettings {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Partial<TeamSyncSettings>;
  return {
    reminderThresholdHours:
      typeof obj.reminderThresholdHours === 'number' && obj.reminderThresholdHours >= 1
        ? obj.reminderThresholdHours
        : DEFAULT_SETTINGS.reminderThresholdHours,
    escalationThresholdHours:
      typeof obj.escalationThresholdHours === 'number' && obj.escalationThresholdHours >= 1
        ? obj.escalationThresholdHours
        : DEFAULT_SETTINGS.escalationThresholdHours,
    escalationContactId:
      typeof obj.escalationContactId === 'string'
        ? obj.escalationContactId
        : DEFAULT_SETTINGS.escalationContactId,
  };
}

export function getMockStoredSettings(): TeamSyncSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      return normalizeSettings(JSON.parse(raw));
    }
  } catch (e) {
    console.error('Failed to read settings from localStorage', e);
  }
  return DEFAULT_SETTINGS;
}

export function saveMockStoredSettings(settings: TeamSyncSettings) {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    broadcastTeamSyncChange('settings_saved');
  } catch (e) {
    console.error('Failed to write settings to localStorage', e);
  }
}

export function addMockCard(
  name: string,
  options?: { listName?: string; priority?: TaskPriority; due?: string | null; ownerId?: string | null }
): BoardCardSummary {
  const cards = getMockStoredCards();
  const ownerMember = options?.ownerId ? MOCK_MEMBERS.find((m) => m.id === options.ownerId) || null : null;
  const now = new Date().toISOString();

  const newCard: BoardCardSummary = {
    id: `card_${Date.now()}`,
    name: name.trim(),
    listName: options?.listName || 'To Do',
    due: options?.due ?? null,
    dueComplete: options?.listName === 'Done',
    dateLastActivity: now,
    labels: options?.priority ? [{ name: options.priority }] : [],
    data: {
      priority: options?.priority || 'Medium',
      trelloStatus: options?.listName === 'Done' ? 'Done' : options?.listName === 'To Do' ? 'To Do' : 'In Progress',
      handoffLabel: options?.listName === 'Done' ? 'Completed' : 'Not started',
      owner: ownerMember
        ? {
            id: ownerMember.id,
            fullName: ownerMember.fullName,
            username: ownerMember.username,
            avatarUrl: ownerMember.avatarUrl,
            initials: ownerMember.initials,
            assignedAt: now,
            assignedBy: { id: ownerMember.id, fullName: ownerMember.fullName },
          }
        : null,
      handoff: null,
      history: ownerMember
        ? [
            {
              id: `hist_${Date.now()}`,
              type: 'owner_assigned',
              actor: { id: ownerMember.id, fullName: ownerMember.fullName },
              timestamp: now,
              summary: `Task created and assigned to ${ownerMember.fullName}`,
            },
          ]
        : [],
    },
  };

  saveMockStoredCards([newCard, ...cards]);
  return newCard;
}

export function resetMockData() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(SETTINGS_STORAGE_KEY);
  broadcastTeamSyncChange('mock_reset');
}

/**
 * Wraps any ITrelloContext to operate against a specific target card ID cleanly.
 */
export function createScopedCardContext(
  baseContext: ITrelloContext,
  targetCardId: string
): ITrelloContext {
  return {
    ...baseContext,
    getCardData: () => baseContext.getCardData(targetCardId),
    setCardData: (newData: TeamSyncCardData) => baseContext.setCardData(newData, targetCardId),
  };
}

/**
 * Creates a mock Trello context bound to a specific card ID and simulated user
 */
export function createMockTrelloContext(
  cardId: string,
  currentMemberId: string = 'mem_andre',
  onUpdate?: () => void
): ITrelloContext {
  return {
    isRealTrello: false,

    async getCardData(targetCardId?: string): Promise<TeamSyncCardData> {
      const id = targetCardId || cardId;
      const cards = getMockStoredCards();
      const card = cards.find((c) => c.id === id);
      return normalizeCardData(card?.data);
    },

    async setCardData(newData: TeamSyncCardData, targetCardId?: string): Promise<void> {
      const id = targetCardId || cardId;
      const cards = getMockStoredCards();
      const index = cards.findIndex((c) => c.id === id);
      const now = new Date().toISOString();
      if (index >= 0) {
        cards[index] = { ...cards[index], dateLastActivity: now, data: newData };
      } else {
        cards.push({ id, name: 'Untitled Card', listName: 'In Progress', dateLastActivity: now, data: newData });
      }
      saveMockStoredCards(cards);
      if (onUpdate) onUpdate();
    },

    async updateCardMeta(targetCardId: string, patch: MockCardUpdatePatch): Promise<void> {
      const cards = getMockStoredCards();
      const index = cards.findIndex((c) => c.id === targetCardId);
      if (index < 0) return;

      const current = cards[index];
      const nextList = patch.listName ?? current.listName;
      const nextDueComplete =
        patch.dueComplete !== undefined
          ? patch.dueComplete
          : patch.trelloStatus === 'Done'
            ? true
            : patch.trelloStatus
              ? false
              : current.dueComplete;

      cards[index] = {
        ...current,
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        listName: nextList,
        ...(patch.due !== undefined ? { due: patch.due } : {}),
        dueComplete: nextDueComplete,
        dateLastActivity: new Date().toISOString(),
        data: {
          ...current.data,
          ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
          ...(patch.trelloStatus !== undefined ? { trelloStatus: patch.trelloStatus } : {}),
        },
      };
      saveMockStoredCards(cards);
      if (onUpdate) onUpdate();
    },

    async getMembers(): Promise<TeamMember[]> {
      return MOCK_MEMBERS;
    },

    async getCurrentMember(): Promise<TeamMember> {
      return MOCK_MEMBERS.find((m) => m.id === currentMemberId) || MOCK_MEMBERS[0];
    },

    async getBoardCards(): Promise<BoardCardSummary[]> {
      return getMockStoredCards();
    },

    async getBoardInfo(): Promise<BoardInfo> {
      return {
        id: 'board_mock_sprint',
        name: 'Product Sprint',
        isConnected: true,
        memberCount: MOCK_MEMBERS.length,
        lastSyncedAt: new Date().toISOString(),
      };
    },

    async getSettings(): Promise<TeamSyncSettings> {
      return getMockStoredSettings();
    },

    async saveSettings(settings: TeamSyncSettings): Promise<void> {
      saveMockStoredSettings(settings);
      if (onUpdate) onUpdate();
    },

    notify(message: string) {
      console.log(`[TeamSync Notification]: ${message}`);
    },
  };
}

/**
 * Creates a real Trello context communicating with window.TrelloPowerUp.iframe()
 */
export function createRealTrelloContext(): ITrelloContext {
  const t = window.TrelloPowerUp?.iframe();
  if (!t) {
    throw new Error('window.TrelloPowerUp.iframe() is not available');
  }

  return {
    isRealTrello: true,

    async getCardData(targetCardId?: string): Promise<TeamSyncCardData> {
      const scope = targetCardId || 'card';
      const data = await t.get(scope, 'shared', 'teamsync');
      return normalizeCardData(data);
    },

    async setCardData(newData: TeamSyncCardData, targetCardId?: string): Promise<void> {
      const scope = targetCardId || 'card';
      await t.set(scope, 'shared', 'teamsync', newData);
      broadcastTeamSyncChange('trello_card_updated');
    },

    async getMembers(): Promise<TeamMember[]> {
      const board = await t.board('members');
      return (board.members || []).map((m) => ({
        id: m.id,
        fullName: m.fullName,
        username: m.username,
        initials: getMemberInitials(m.fullName),
        avatarUrl: formatTrelloAvatar(m.avatar),
      }));
    },

    async getCurrentMember(): Promise<TeamMember> {
      const member = await t.member('id', 'fullName', 'username', 'avatar');
      return {
        id: member.id,
        fullName: member.fullName,
        username: member.username,
        initials: getMemberInitials(member.fullName),
        avatarUrl: formatTrelloAvatar(member.avatar),
      };
    },

    async getBoardCards(): Promise<BoardCardSummary[]> {
      const [rawCards, rawLists] = await Promise.all([
        t.cards('id', 'name', 'idList', 'due', 'dueComplete', 'members', 'labels', 'closed', 'url', 'dateLastActivity'),
        t.lists ? t.lists('id', 'name').catch(() => []) : Promise.resolve([]),
      ]);

      const listMap = new Map<string, string>();
      for (const l of rawLists) {
        listMap.set(l.id, l.name);
      }

      const openCards = rawCards.filter((c) => !c.closed);

      // Fetch TeamSync shared pluginData for every open card in parallel via official SDK scope
      const cardDataList = await Promise.all(
        openCards.map((c) =>
          t
            .get(c.id, 'shared', 'teamsync')
            .then((val) => normalizeCardData(val))
            .catch(() => normalizeCardData(null))
        )
      );

      return openCards.map((c, idx) => ({
        id: c.id,
        name: c.name,
        idList: c.idList,
        listName: (c.idList && listMap.get(c.idList)) || 'Board',
        due: c.due ?? null,
        dueComplete: Boolean(c.dueComplete),
        url: c.url,
        dateLastActivity: c.dateLastActivity,
        labels: (c.labels || []).map((lbl) => ({
          id: lbl.id,
          name: lbl.name || '',
          color: lbl.color,
        })),
        trelloMembers: (c.members || []).map((m) => ({
          id: m.id,
          fullName: m.fullName,
          username: m.username,
          initials: getMemberInitials(m.fullName),
          avatarUrl: formatTrelloAvatar(m.avatar),
        })),
        data: cardDataList[idx],
      }));
    },

    async getBoardInfo(): Promise<BoardInfo> {
      const board = await t.board('id', 'name', 'members');
      return {
        id: board.id,
        name: board.name || 'Trello Board',
        isConnected: true,
        memberCount: board.members?.length || 0,
        lastSyncedAt: new Date().toISOString(),
      };
    },

    async getSettings(): Promise<TeamSyncSettings> {
      try {
        const stored = await t.get('board', 'shared', 'teamsync_settings');
        if (stored && typeof stored === 'object') {
          return normalizeSettings(stored);
        }
      } catch (e) {
        console.warn('Could not read board settings, using defaults', e);
      }
      return DEFAULT_SETTINGS;
    },

    async saveSettings(settings: TeamSyncSettings): Promise<void> {
      await t.set('board', 'shared', 'teamsync_settings', settings);
      broadcastTeamSyncChange('trello_settings_updated');
    },

    async openCardInTrello(targetCardId: string): Promise<void> {
      if (t.showCard) {
        await t.showCard(targetCardId);
      }
    },

    sizeToContent() {
      try {
        t.sizeTo?.('#root');
      } catch {
        // Non-resizable container (like fixed modal); ignore
      }
    },

    notify(message: string) {
      if (t.alert) {
        t.alert({ message, duration: 4 });
      }
    },
  };
}

/**
 * Initializes Trello Power-Up connector capability hooks
 */
export function initTrelloConnector() {
  if (!window.TrelloPowerUp) {
    console.warn('TrelloPowerUp client script is not loaded.');
    return;
  }

  const ICON_URL = window.location.origin + '/favicon.svg';

  window.TrelloPowerUp.initialize({
    'card-badges': async function (t: TrelloIframe) {
      const [data, settingsRaw] = await Promise.all([
        t.get('card', 'shared', 'teamsync') as Promise<TeamSyncCardData | undefined>,
        t.get('board', 'shared', 'teamsync_settings').catch(() => undefined),
      ]);

      const settingsObj =
        settingsRaw && typeof settingsRaw === 'object' ? (settingsRaw as Partial<TeamSyncSettings>) : {};
      const reminderHours = Number(settingsObj.reminderThresholdHours) || 12;
      const thresholdHours = Number(settingsObj.escalationThresholdHours) || 24;

      if (!data || !data.owner) {
        return [{
          text: '⚠️ Needs Owner',
          color: 'red',
        }];
      }

      if (data.handoff?.status === 'pending') {
        const recipientName = data.handoff.toMember ? data.handoff.toMember.fullName.split(' ')[0] : 'Member';
        const createdMs = data.handoff.createdAt ? new Date(data.handoff.createdAt).getTime() : Date.now();
        const elapsedHours = (Date.now() - createdMs) / (1000 * 60 * 60);

        if (elapsedHours >= thresholdHours) {
          return [{
            text: `🚨 Escalated → ${recipientName}`,
            color: 'red',
          }];
        }

        if (elapsedHours >= reminderHours || Boolean(data.handoff.reminderSentAt)) {
          return [{
            text: `🔔 Reminder → ${recipientName}`,
            color: 'orange',
          }];
        }

        return [{
          text: `⏳ Handoff → ${recipientName}`,
          color: 'yellow',
        }];
      }

      return [{
        text: `👤 ${data.owner.fullName.split(' ')[0]}`,
        color: 'blue',
      }];
    },

    'card-detail-badges': async function (t: TrelloIframe) {
      const [data, settingsRaw] = await Promise.all([
        t.get('card', 'shared', 'teamsync') as Promise<TeamSyncCardData | undefined>,
        t.get('board', 'shared', 'teamsync_settings').catch(() => undefined),
      ]);

      const settingsObj =
        settingsRaw && typeof settingsRaw === 'object' ? (settingsRaw as Partial<TeamSyncSettings>) : {};
      const reminderHours = Number(settingsObj.reminderThresholdHours) || 12;
      const thresholdHours = Number(settingsObj.escalationThresholdHours) || 24;
      const contactId = settingsObj.escalationContactId || '';

      const badges: Array<{ title: string; text: string; color: string }> = [];

      if (!data?.owner) {
        badges.push({
          title: 'TeamSync Owner',
          text: 'Unassigned',
          color: 'red',
        });
      } else {
        badges.push({
          title: 'Primary Owner',
          text: data.owner.fullName,
          color: 'blue',
        });
      }

      if (data?.handoff?.status === 'pending') {
        const createdMs = data.handoff.createdAt ? new Date(data.handoff.createdAt).getTime() : Date.now();
        const elapsedHours = (Date.now() - createdMs) / (1000 * 60 * 60);
        const escalated = elapsedHours >= thresholdHours;
        const reminded = !escalated && (elapsedHours >= reminderHours || Boolean(data.handoff.reminderSentAt));

        badges.push({
          title: escalated ? 'Escalated Handoff' : reminded ? 'Handoff Reminder Sent' : 'Handoff Status',
          text: escalated
            ? `Needs Attention (${data.handoff.toMember.fullName})`
            : reminded
              ? `Reminder Sent (${data.handoff.toMember.fullName})`
              : `Pending (${data.handoff.toMember.fullName})`,
          color: escalated ? 'red' : reminded ? 'orange' : 'yellow',
        });

        if (escalated && (contactId || data.handoff.escalationNotifiedTo?.fullName)) {
          try {
            const board = contactId ? await t.board('members') : null;
            const contact = board?.members?.find((m) => m.id === contactId);
            const managerName =
              contact?.fullName || data.handoff.escalationNotifiedTo?.fullName || 'Escalation Lead';
            badges.push({
              title: 'Escalation Lead Alerted',
              text: managerName,
              color: 'red',
            });
          } catch {
            // Safe ignore if board members unavailable
          }
        }
      }

      return badges;
    },

    'card-buttons': function () {
      return [
        {
          icon: ICON_URL,
          text: 'TeamSync Owner',
          callback: function (tBtn: TrelloIframe) {
            return tBtn.modal?.({
              url: tBtn.signUrl ? tBtn.signUrl('./index.html?view=card-back') : './index.html?view=card-back',
              title: 'TeamSync Task Ownership',
              accentColor: '#2563EB',
              height: 440,
            });
          },
        },
      ];
    },

    'card-back-section': function (t: TrelloIframe) {
      return {
        title: 'TeamSync Responsibility & Handoff',
        icon: ICON_URL,
        content: {
          type: 'iframe',
          url: t.signUrl ? t.signUrl('./index.html?view=card-back') : './index.html?view=card-back',
          height: 420,
        },
      };
    },

    'board-buttons': function () {
      return [
        {
          icon: ICON_URL,
          text: 'TeamSync Overview',
          callback: function (tModal: TrelloIframe) {
            return tModal.modal?.({
              url: tModal.signUrl ? tModal.signUrl('./index.html?view=overview') : './index.html?view=overview',
              title: 'TeamSync : Board Overview',
              accentColor: '#2563EB',
              fullscreen: true,
            });
          },
        },
      ];
    },
  });
}
