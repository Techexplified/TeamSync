import type { TeamMember, BoardCardSummary } from '../types/teamsync';

export const MOCK_MEMBERS: TeamMember[] = [
  {
    id: 'mem_rahul',
    fullName: 'Rahul Sharma',
    username: 'rahul',
    initials: 'RS',
    role: 'Tech Lead',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
  },
  {
    id: 'mem_priya',
    fullName: 'Priya Nair',
    username: 'priya',
    initials: 'PN',
    role: 'Product Designer',
    avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&auto=format&fit=crop&q=80',
  },
  {
    id: 'mem_maya',
    fullName: 'Maya Patel',
    username: 'maya',
    initials: 'MP',
    role: 'Backend Engineer',
    avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=100&auto=format&fit=crop&q=80',
  },
  {
    id: 'mem_alex',
    fullName: 'Alex Kumar',
    username: 'alex',
    initials: 'AK',
    role: 'DevOps & Reliability',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80',
  },
];

// Helper to calculate past timestamp in ISO format
const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000).toISOString();

export const INITIAL_MOCK_CARDS: BoardCardSummary[] = [
  // 1. homepage (from wireframe table: owner = Rahul, status = active)
  {
    id: 'card_homepage',
    name: 'homepage',
    listName: 'In Progress',
    data: {
      owner: {
        id: 'mem_rahul',
        fullName: 'Rahul Sharma',
        username: 'rahul',
        initials: 'RS',
        assignedAt: hoursAgo(48),
        assignedBy: { id: 'mem_rahul', fullName: 'Rahul Sharma' },
      },
      handoff: null,
      history: [
        {
          id: 'hist_1',
          type: 'owner_assigned',
          actor: { id: 'mem_rahul', fullName: 'Rahul Sharma' },
          timestamp: hoursAgo(48),
          summary: 'Rahul Sharma claimed primary task ownership',
        },
      ],
    },
  },

  // 2. API Review (from wireframe table: owner = Priya, status = handoff pending)
  {
    id: 'card_api_review',
    name: 'API Review',
    listName: 'Review',
    data: {
      owner: {
        id: 'mem_rahul', // Guardrail: Rahul remains owner until Priya accepts!
        fullName: 'Rahul Sharma',
        username: 'rahul',
        initials: 'RS',
        assignedAt: hoursAgo(30),
        assignedBy: { id: 'mem_rahul', fullName: 'Rahul Sharma' },
      },
      handoff: {
        id: 'ho_101',
        status: 'pending',
        fromMember: MOCK_MEMBERS[0], // Rahul
        toMember: MOCK_MEMBERS[1],   // Priya
        note: 'Completed schema changes for v2 endpoints. Need you to verify response payload shapes against the UI mockups.',
        createdAt: hoursAgo(4),      // 4 hours ago (normal pending, <24h)
      },
      history: [
        {
          id: 'hist_2',
          type: 'owner_assigned',
          actor: { id: 'mem_rahul', fullName: 'Rahul Sharma' },
          timestamp: hoursAgo(30),
          summary: 'Rahul Sharma designated as primary owner',
        },
        {
          id: 'hist_3',
          type: 'handoff_requested',
          actor: { id: 'mem_rahul', fullName: 'Rahul Sharma' },
          timestamp: hoursAgo(4),
          summary: 'Rahul Sharma requested handoff to Priya Nair',
          note: 'Completed schema changes for v2 endpoints. Need you to verify response payload shapes against the UI mockups.',
        },
      ],
    },
  },

  // 3. login bug (from wireframe table: owner = unassigned, status = needs owner)
  {
    id: 'card_login_bug',
    name: 'login bug',
    listName: 'To Do',
    data: {
      owner: null,
      handoff: null,
      history: [],
    },
  },

  // 4. Payment Webhook (status = needs attention: pending > 36 hours!)
  {
    id: 'card_payment_webhook',
    name: 'Payment Webhook Failure Alert',
    listName: 'Blocked',
    data: {
      owner: {
        id: 'mem_maya',
        fullName: 'Maya Patel',
        username: 'maya',
        initials: 'MP',
        assignedAt: hoursAgo(72),
        assignedBy: { id: 'mem_rahul', fullName: 'Rahul Sharma' },
      },
      handoff: {
        id: 'ho_102',
        status: 'pending',
        fromMember: MOCK_MEMBERS[2], // Maya
        toMember: MOCK_MEMBERS[3],   // Alex
        note: 'Stripe webhook secrets need rotation on AWS Secrets Manager. Blocked until DevOps updates production credentials.',
        createdAt: hoursAgo(36),      // 36 hours ago (>24h threshold -> needs attention / escalated!)
      },
      history: [
        {
          id: 'hist_4',
          type: 'owner_assigned',
          actor: { id: 'mem_rahul', fullName: 'Rahul Sharma' },
          timestamp: hoursAgo(72),
          summary: 'Assigned to Maya Patel',
        },
        {
          id: 'hist_5',
          type: 'handoff_requested',
          actor: { id: 'mem_maya', fullName: 'Maya Patel' },
          timestamp: hoursAgo(36),
          summary: 'Maya Patel requested handoff to Alex Kumar',
          note: 'Stripe webhook secrets need rotation on AWS Secrets Manager. Blocked until DevOps updates production credentials.',
        },
      ],
    },
  },
];

