import type {
  ResponsibilityHistoryItem,
  TaskHandoff,
  TeamMember,
  TeamSyncCardData,
} from '../types/teamsync';
import { formatDurationMs } from './statusUtils';

let histSeq = 0;
function nextHistoryId(prefix: string): string {
  histSeq += 1;
  return `${prefix}_${Date.now()}_${histSeq}`;
}

export function buildRequestHandoffData(
  data: TeamSyncCardData,
  toMember: TeamMember,
  note: string,
  currentMember?: TeamMember | null
): TeamSyncCardData | null {
  if (!data.owner) return null;

  const actor = currentMember || data.owner;
  const now = new Date().toISOString();

  const handoff: TaskHandoff = {
    id: `ho_${Date.now()}`,
    fromMember: {
      id: data.owner.id,
      fullName: data.owner.fullName,
      username: data.owner.username,
      avatarUrl: data.owner.avatarUrl,
      initials: data.owner.initials,
    },
    toMember,
    note,
    createdAt: now,
    status: 'pending',
  };

  const entry: ResponsibilityHistoryItem = {
    id: nextHistoryId('hist_req'),
    type: 'handoff_requested',
    actor: { id: actor.id, fullName: actor.fullName },
    timestamp: now,
    summary: `${actor.fullName} requested handoff to ${toMember.fullName}`,
    note: note || undefined,
    meta: {
      fromMemberName: data.owner.fullName,
      toMemberName: toMember.fullName,
    },
  };

  return {
    ...data,
    handoff,
    handoffLabel: 'Pending',
    history: [entry, ...data.history],
  };
}

export function buildAcceptHandoffData(
  data: TeamSyncCardData,
  currentMember?: TeamMember | null
): TeamSyncCardData | null {
  if (!data.handoff || data.handoff.status !== 'pending') return null;

  const recipient = data.handoff.toMember;
  const sender = data.handoff.fromMember;
  const actor = currentMember || recipient;
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();

  const createdMs = data.handoff.createdAt ? new Date(data.handoff.createdAt).getTime() : NaN;
  const responseMs = !Number.isNaN(createdMs) ? Math.max(0, nowMs - createdMs) : undefined;
  const durationSuffix =
    responseMs !== undefined ? ` after ${formatDurationMs(responseMs)}` : '';

  const entry: ResponsibilityHistoryItem = {
    id: nextHistoryId('hist_acc'),
    type: 'handoff_accepted',
    actor: { id: actor.id, fullName: actor.fullName },
    timestamp: now,
    summary: `${recipient.fullName} accepted handoff from ${sender.fullName}${durationSuffix} and assumed primary ownership`,
    meta: {
      fromMemberName: sender.fullName,
      toMemberName: recipient.fullName,
      responseMs,
    },
  };

  return {
    ...data,
    owner: {
      id: recipient.id,
      fullName: recipient.fullName,
      username: recipient.username,
      avatarUrl: recipient.avatarUrl,
      initials: recipient.initials,
      assignedAt: now,
      assignedBy: { id: sender.id, fullName: sender.fullName },
    },
    handoff: null,
    handoffLabel: 'In Progress',
    history: [entry, ...data.history],
  };
}

export function buildDeclineHandoffData(
  data: TeamSyncCardData,
  reason: string,
  currentMember?: TeamMember | null
): TeamSyncCardData | null {
  if (!data.handoff || !reason.trim()) return null;

  const recipient = currentMember || data.handoff.toMember;
  const sender = data.handoff.fromMember;
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const createdMs = data.handoff.createdAt ? new Date(data.handoff.createdAt).getTime() : NaN;
  const responseMs = !Number.isNaN(createdMs) ? Math.max(0, nowMs - createdMs) : undefined;

  const entry: ResponsibilityHistoryItem = {
    id: nextHistoryId('hist_dec'),
    type: 'handoff_declined',
    actor: { id: recipient.id, fullName: recipient.fullName },
    timestamp: now,
    summary: `${recipient.fullName} declined handoff from ${sender.fullName}`,
    note: reason.trim(),
    meta: {
      fromMemberName: sender.fullName,
      toMemberName: recipient.fullName,
      responseMs,
    },
  };

  return {
    ...data,
    handoff: {
      ...data.handoff,
      status: 'declined',
      resolvedAt: now,
      declineReason: reason.trim(),
    },
    handoffLabel: 'Not started',
    history: [entry, ...data.history],
  };
}

export function buildCancelHandoffData(
  data: TeamSyncCardData,
  currentMember?: TeamMember | null
): TeamSyncCardData | null {
  if (!data.handoff) return null;

  const actor = currentMember || data.handoff.fromMember;
  const now = new Date().toISOString();

  const entry: ResponsibilityHistoryItem = {
    id: nextHistoryId('hist_can'),
    type: 'handoff_cancelled',
    actor: { id: actor.id, fullName: actor.fullName },
    timestamp: now,
    summary: `${actor.fullName} cancelled the pending handoff to ${data.handoff.toMember.fullName}`,
    meta: {
      fromMemberName: data.handoff.fromMember.fullName,
      toMemberName: data.handoff.toMember.fullName,
    },
  };

  return {
    ...data,
    handoff: null,
    handoffLabel: 'Not started',
    history: [entry, ...data.history],
  };
}

export function buildEscalationData(
  data: TeamSyncCardData,
  escalationThresholdHours: number,
  escalationContact: TeamMember | null,
  actor?: TeamMember | null,
  options?: { forceRenotify?: boolean; acknowledge?: boolean }
): { nextData: TeamSyncCardData; didChange: boolean } {
  const ho = data.handoff;
  if (!ho || ho.status !== 'pending') {
    return { nextData: data, didChange: false };
  }

  const nowMs = Date.now();
  const createdMs = ho.createdAt ? new Date(ho.createdAt).getTime() : nowMs;
  const elapsedHours = !Number.isNaN(createdMs) ? Math.max(0, (nowMs - createdMs) / (1000 * 60 * 60)) : 0;

  if (elapsedHours < escalationThresholdHours && !options?.acknowledge && !options?.forceRenotify) {
    return { nextData: data, didChange: false };
  }

  const now = new Date(nowMs).toISOString();
  const actorInfo = actor
    ? { id: actor.id, fullName: actor.fullName }
    : escalationContact
      ? { id: escalationContact.id, fullName: escalationContact.fullName }
      : { id: 'system_teamsync', fullName: 'TeamSync Escalation' };

  if (options?.acknowledge) {
    const entry: ResponsibilityHistoryItem = {
      id: nextHistoryId('hist_esc_ack'),
      type: 'handoff_escalated',
      actor: actorInfo,
      timestamp: now,
      summary: `${actorInfo.fullName} acknowledged escalated handoff (${ho.fromMember.fullName} → ${ho.toMember.fullName})`,
      meta: {
        fromMemberName: ho.fromMember.fullName,
        toMemberName: ho.toMember.fullName,
        escalationContactName: escalationContact?.fullName || actorInfo.fullName,
      },
    };

    return {
      didChange: true,
      nextData: {
        ...data,
        handoff: {
          ...ho,
          escalatedAt: ho.escalatedAt || now,
          escalationNotifiedAt: ho.escalationNotifiedAt || now,
          escalationNotifiedTo:
            ho.escalationNotifiedTo ||
            (escalationContact
              ? { id: escalationContact.id, fullName: escalationContact.fullName }
              : undefined),
          escalationAcknowledgedAt: now,
          escalationAcknowledgedBy: actorInfo,
        },
        history: [entry, ...data.history],
      },
    };
  }

  const alreadyEscalated = Boolean(ho.escalatedAt);
  const contactChanged =
    Boolean(escalationContact) && ho.escalationNotifiedTo?.id !== escalationContact?.id;

  if (alreadyEscalated && !options?.forceRenotify && !contactChanged) {
    return { nextData: data, didChange: false };
  }

  const elapsedLabel = formatDurationMs(nowMs - createdMs);
  const targetManagerText = escalationContact
    ? ` — Escalation lead ${escalationContact.fullName} alerted`
    : ' — Flagged for escalation';

  const summary = options?.forceRenotify
    ? `${actorInfo.fullName} sent escalation alert (${ho.fromMember.fullName} → ${ho.toMember.fullName}, pending ${elapsedLabel})${
        escalationContact ? ` to ${escalationContact.fullName}` : ''
      }`
    : `Handoff escalated after exceeding ${escalationThresholdHours}h threshold (waiting ${elapsedLabel})${targetManagerText}`;

  const entry: ResponsibilityHistoryItem = {
    id: nextHistoryId('hist_esc'),
    type: 'handoff_escalated',
    actor: actorInfo,
    timestamp: now,
    summary,
    meta: {
      fromMemberName: ho.fromMember.fullName,
      toMemberName: ho.toMember.fullName,
      escalationContactName: escalationContact?.fullName,
    },
  };

  return {
    didChange: true,
    nextData: {
      ...data,
      handoff: {
        ...ho,
        escalatedAt: ho.escalatedAt || now,
        escalationNotifiedAt: escalationContact ? now : ho.escalationNotifiedAt,
        escalationNotifiedTo: escalationContact
          ? { id: escalationContact.id, fullName: escalationContact.fullName }
          : ho.escalationNotifiedTo,
      },
      history: [entry, ...data.history],
    },
  };
}

