import {
  Expense,
  GroupEvent,
  GroupEventType,
  Member,
  Settlement,
  VersionVector,
} from './types';

const VALID_EVENT_TYPES: Set<GroupEventType> = new Set([
  'group_created',
  'member_added',
  'member_claimed',
  'member_renamed',
  'expense_upserted',
  'expense_deleted',
  'settlement_upserted',
  'settlement_deleted',
  'group_status',
]);

const VALID_GROUP_TYPES = new Set(['trip', 'event', 'household', 'other']);
const VALID_SPLIT_TYPES = new Set(['equal', 'exact', 'percent', 'shares']);

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates untrusted incoming GroupEvent data.
 */
export function validateGroupEvent(event: unknown, expectedGroupId?: string): ValidationResult {
  if (!event || typeof event !== 'object') {
    return { valid: false, error: 'Event must be an object' };
  }

  const e = event as Partial<GroupEvent>;

  if (typeof e.id !== 'string' || !e.id.includes(':')) {
    return { valid: false, error: 'Invalid event id format' };
  }

  if (typeof e.groupId !== 'string' || e.groupId.length === 0 || e.groupId.length > 100) {
    return { valid: false, error: 'Invalid groupId' };
  }

  if (expectedGroupId && e.groupId !== expectedGroupId) {
    return { valid: false, error: `groupId mismatch: expected ${expectedGroupId}, got ${e.groupId}` };
  }

  if (typeof e.deviceId !== 'string' || e.deviceId.length === 0 || e.deviceId.length > 100) {
    return { valid: false, error: 'Invalid deviceId' };
  }

  if (typeof e.seq !== 'number' || !Number.isInteger(e.seq) || e.seq < 1) {
    return { valid: false, error: 'Invalid seq' };
  }

  if (e.id !== `${e.deviceId}:${e.seq}`) {
    return { valid: false, error: 'Event id does not match deviceId:seq' };
  }

  if (typeof e.lc !== 'number' || !Number.isInteger(e.lc) || e.lc < 1) {
    return { valid: false, error: 'Invalid lc' };
  }

  if (typeof e.ts !== 'number' || !Number.isInteger(e.ts) || e.ts < 0) {
    return { valid: false, error: 'Invalid ts' };
  }

  if (typeof e.type !== 'string' || !VALID_EVENT_TYPES.has(e.type as GroupEventType)) {
    return { valid: false, error: `Unknown event type: ${e.type}` };
  }

  // Validate payload per event type
  const payload = e.payload as Record<string, unknown>;
  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'Event payload must be an object' };
  }

  switch (e.type) {
    case 'group_created': {
      if (typeof payload.name !== 'string' || payload.name.trim().length === 0 || payload.name.length > 100) {
        return { valid: false, error: 'Invalid group name in group_created' };
      }
      if (typeof payload.type !== 'string' || !VALID_GROUP_TYPES.has(payload.type)) {
        return { valid: false, error: 'Invalid group type in group_created' };
      }
      if (typeof payload.currency !== 'string' || payload.currency.length === 0 || payload.currency.length > 10) {
        return { valid: false, error: 'Invalid currency in group_created' };
      }
      break;
    }

    case 'member_added': {
      const m = payload.member as Partial<Member>;
      if (!m || typeof m !== 'object') {
        return { valid: false, error: 'Missing member in member_added' };
      }
      if (typeof m.id !== 'string' || m.id.length === 0 || m.id.length > 100) {
        return { valid: false, error: 'Invalid member id' };
      }
      if (typeof m.name !== 'string' || m.name.trim().length === 0 || m.name.length > 50) {
        return { valid: false, error: 'Invalid member name' };
      }
      if (m.kind !== 'device' && m.kind !== 'ghost') {
        return { valid: false, error: 'Invalid member kind' };
      }
      break;
    }

    case 'member_claimed': {
      if (typeof payload.memberId !== 'string' || payload.memberId.length === 0) {
        return { valid: false, error: 'Invalid memberId in member_claimed' };
      }
      if (typeof payload.deviceId !== 'string' || payload.deviceId.length === 0) {
        return { valid: false, error: 'Invalid deviceId in member_claimed' };
      }
      break;
    }

    case 'member_renamed': {
      if (typeof payload.memberId !== 'string' || payload.memberId.length === 0) {
        return { valid: false, error: 'Invalid memberId in member_renamed' };
      }
      if (typeof payload.name !== 'string' || payload.name.trim().length === 0 || payload.name.length > 50) {
        return { valid: false, error: 'Invalid name in member_renamed' };
      }
      break;
    }

    case 'expense_upserted': {
      const exp = payload.expense as Partial<Expense>;
      if (!exp || typeof exp !== 'object') {
        return { valid: false, error: 'Missing expense in expense_upserted' };
      }
      if (typeof exp.id !== 'string' || exp.id.length === 0) {
        return { valid: false, error: 'Invalid expense id' };
      }
      if (typeof exp.title !== 'string' || exp.title.trim().length === 0 || exp.title.length > 100) {
        return { valid: false, error: 'Invalid expense title' };
      }
      if (typeof exp.amountMinor !== 'number' || !Number.isInteger(exp.amountMinor) || exp.amountMinor <= 0) {
        return { valid: false, error: 'Expense amount must be a positive integer minor unit' };
      }
      if (typeof exp.paidBy !== 'string' || exp.paidBy.length === 0) {
        return { valid: false, error: 'Invalid paidBy in expense' };
      }
      if (typeof exp.splitType !== 'string' || !VALID_SPLIT_TYPES.has(exp.splitType)) {
        return { valid: false, error: 'Invalid splitType in expense' };
      }
      if (!Array.isArray(exp.participants) || exp.participants.length === 0) {
        return { valid: false, error: 'Expense must have at least one participant' };
      }
      for (const p of exp.participants) {
        if (!p || typeof p.memberId !== 'string' || p.memberId.length === 0) {
          return { valid: false, error: 'Invalid participant memberId' };
        }
        if (p.value !== undefined && (typeof p.value !== 'number' || p.value < 0)) {
          return { valid: false, error: 'Participant value must be a non-negative number' };
        }
      }
      if (typeof exp.date !== 'number' || !Number.isInteger(exp.date)) {
        return { valid: false, error: 'Invalid expense date' };
      }
      break;
    }

    case 'expense_deleted': {
      if (typeof payload.expenseId !== 'string' || payload.expenseId.length === 0) {
        return { valid: false, error: 'Invalid expenseId in expense_deleted' };
      }
      break;
    }

    case 'settlement_upserted': {
      const s = payload.settlement as Partial<Settlement>;
      if (!s || typeof s !== 'object') {
        return { valid: false, error: 'Missing settlement in settlement_upserted' };
      }
      if (typeof s.id !== 'string' || s.id.length === 0) {
        return { valid: false, error: 'Invalid settlement id' };
      }
      if (typeof s.from !== 'string' || s.from.length === 0) {
        return { valid: false, error: 'Invalid from in settlement' };
      }
      if (typeof s.to !== 'string' || s.to.length === 0) {
        return { valid: false, error: 'Invalid to in settlement' };
      }
      if (s.from === s.to) {
        return { valid: false, error: 'Settlement from and to cannot be the same member' };
      }
      if (typeof s.amountMinor !== 'number' || !Number.isInteger(s.amountMinor) || s.amountMinor <= 0) {
        return { valid: false, error: 'Settlement amount must be a positive integer minor unit' };
      }
      if (typeof s.date !== 'number' || !Number.isInteger(s.date)) {
        return { valid: false, error: 'Invalid settlement date' };
      }
      break;
    }

    case 'settlement_deleted': {
      if (typeof payload.settlementId !== 'string' || payload.settlementId.length === 0) {
        return { valid: false, error: 'Invalid settlementId in settlement_deleted' };
      }
      break;
    }

    case 'group_status': {
      if (payload.status !== 'open' && payload.status !== 'closed') {
        return { valid: false, error: 'Invalid status in group_status' };
      }
      break;
    }
  }

  return { valid: true };
}

/**
 * Calculates the delta of events that the remote device is missing
 * based on the remote version vector.
 */
export function calculateDelta(localEvents: GroupEvent[], remoteVector: VersionVector): GroupEvent[] {
  return localEvents.filter((event) => {
    const remoteSeq = remoteVector[event.deviceId] ?? 0;
    return event.seq > remoteSeq;
  });
}

export interface MergeResult {
  mergedEvents: GroupEvent[];
  newEventsCount: number;
  invalidEventsCount: number;
  errors: string[];
}

/**
 * Merges incoming untrusted events into an existing local event log.
 * Ensures idempotence, commutativity, and associativity by unioning on event.id.
 */
export function mergeEvents(
  localEvents: GroupEvent[],
  incomingEvents: unknown[],
  expectedGroupId?: string
): MergeResult {
  const eventMap = new Map<string, GroupEvent>();
  for (const event of localEvents) {
    eventMap.set(event.id, event);
  }

  let newEventsCount = 0;
  let invalidEventsCount = 0;
  const errors: string[] = [];

  for (const item of incomingEvents) {
    const validation = validateGroupEvent(item, expectedGroupId);
    if (!validation.valid) {
      invalidEventsCount++;
      if (validation.error) errors.push(validation.error);
      continue;
    }

    const event = item as GroupEvent;
    if (!eventMap.has(event.id)) {
      eventMap.set(event.id, event);
      newEventsCount++;
    }
  }

  // Sort deterministically by lc ascending, then deviceId, then seq
  const mergedEvents = Array.from(eventMap.values()).sort((a, b) => {
    if (a.lc !== b.lc) return a.lc - b.lc;
    if (a.deviceId !== b.deviceId) return a.deviceId.localeCompare(b.deviceId);
    return a.seq - b.seq;
  });

  return {
    mergedEvents,
    newEventsCount,
    invalidEventsCount,
    errors,
  };
}
