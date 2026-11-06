import type {
  TeamSyncCardData,
  TeamMember,
  BoardCardSummary,
  ITrelloContext,
} from '../types/teamsync';
import { MOCK_MEMBERS, INITIAL_MOCK_CARDS } from './mockData';

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
    name: string;
    members?: Array<{ id: string; fullName: string; username: string; avatar?: string }>;
  }>;
  cards: (...fields: string[]) => Promise<
    Array<{
      id: string;
      name: string;
      idList?: string;
      pluginData?: Array<{ idPlugin: string; value: string }>;
    }>
  >;
  member: (...fields: string[]) => Promise<{ id: string; fullName: string; username: string; avatar?: string }>;
  sizeTo?: (selector: string | HTMLElement) => void;
  closeModal?: () => void;
  modal?: (options: Record<string, unknown>) => void;
  alert?: (options: { message: string; duration?: number }) => void;
  signUrl?: (url: string) => string;
}

const STORAGE_KEY = 'teamsync_v1_cards';

export function getMockStoredCards(): BoardCardSummary[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to read from localStorage', e);
  }
  return INITIAL_MOCK_CARDS;
}

export function saveMockStoredCards(cards: BoardCardSummary[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
  } catch (e) {
    console.error('Failed to write to localStorage', e);
  }
}

export function resetMockData() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Creates a mock Trello context bound to a specific card ID and simulated user
 */
export function createMockTrelloContext(
  cardId: string,
  currentMemberId: string = 'mem_rahul',
  onUpdate?: () => void
): ITrelloContext {
  return {
    isRealTrello: false,

    async getCardData(): Promise<TeamSyncCardData> {
      const cards = getMockStoredCards();
      const card = cards.find((c) => c.id === cardId);
      return (
        card?.data || {
          owner: null,
          handoff: null,
          history: [],
        }
      );
    },

    async setCardData(newData: TeamSyncCardData): Promise<void> {
      const cards = getMockStoredCards();
      const index = cards.findIndex((c) => c.id === cardId);
      if (index >= 0) {
        cards[index] = { ...cards[index], data: newData };
      } else {
        cards.push({ id: cardId, name: 'Untitled Card', listName: 'In Progress', data: newData });
      }
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

    async getCardData(): Promise<TeamSyncCardData> {
      const data = (await t.get('card', 'shared', 'teamsync')) as TeamSyncCardData | undefined;
      return (
        data || {
          owner: null,
          handoff: null,
          history: [],
        }
      );
    },

    async setCardData(newData: TeamSyncCardData): Promise<void> {
      await t.set('card', 'shared', 'teamsync', newData);
    },

    async getMembers(): Promise<TeamMember[]> {
      const board = await t.board('members');
      return (board.members || []).map((m) => ({
        id: m.id,
        fullName: m.fullName,
        username: m.username,
        avatarUrl: m.avatar ? `${m.avatar}/50.png` : null,
      }));
    },

    async getCurrentMember(): Promise<TeamMember> {
      const member = await t.member('id', 'fullName', 'username', 'avatar');
      return {
        id: member.id,
        fullName: member.fullName,
        username: member.username,
        avatarUrl: member.avatar ? `${member.avatar}/50.png` : null,
      };
    },

    async getBoardCards(): Promise<BoardCardSummary[]> {
      const rawCards = await t.cards('id', 'name', 'idList', 'pluginData');
      return rawCards.map((c) => {
        let cardData: TeamSyncCardData = { owner: null, handoff: null, history: [] };
        if (c.pluginData && c.pluginData.length > 0) {
          const match = c.pluginData.find((p) => p.value);
          if (match) {
            try {
              cardData = JSON.parse(match.value);
            } catch (e) {
              console.error('Error parsing card pluginData', e);
            }
          }
        }
        return {
          id: c.id,
          name: c.name,
          listName: 'Card',
          data: cardData,
        };
      });
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
      const data = (await t.get('card', 'shared', 'teamsync')) as TeamSyncCardData | undefined;

      if (!data || !data.owner) {
        return [{
          text: '⚠️ Needs Owner',
          color: 'red',
        }];
      }

      if (data.handoff?.status === 'pending') {
        const recipientName = data.handoff.toMember ? data.handoff.toMember.fullName.split(' ')[0] : 'Member';
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
      const data = (await t.get('card', 'shared', 'teamsync')) as TeamSyncCardData | undefined;
      const badges = [];

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
        badges.push({
          title: 'Handoff Status',
          text: `Pending (${data.handoff.toMember.fullName})`,
          color: 'yellow',
        });
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
              accentColor: '#0052CC',
              height: 380,
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
          height: 380,
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
              accentColor: '#0052CC',
              fullscreen: true,
            });
          },
        },
      ];
    },
  });
}

