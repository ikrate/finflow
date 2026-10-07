import {
  DerivedGroupState,
  Expense,
  ExpenseDeletedPayload,
  ExpenseUpsertedPayload,
  GroupCreatedPayload,
  GroupEvent,
  GroupEventType,
  GroupKeySetPayload,
  GroupStatusPayload,
  Member,
  MemberAddedPayload,
  MemberClaimedPayload,
  MemberRenamedPayload,
  Settlement,
  SettlementDeletedPayload,
  SettlementUpsertedPayload,
  VersionVector,
} from './types';

/**
 * Deterministic tie-breaking for Last-Writer-Wins.
 * Returns > 0 if a wins over b, < 0 if b wins over a, 0 if identical.
 */
export function compareEventOrder(
  a: { lc: number; deviceId: string },
  b: { lc: number; deviceId: string }
): number {
  if (a.lc !== b.lc) {
    return a.lc - b.lc;
  }
  return a.deviceId.localeCompare(b.deviceId);
}

/**
 * Computes version vector (deviceId -> maxSeq) from a list of events.
 */
export function computeVersionVector(events: GroupEvent[]): VersionVector {
  const vv: VersionVector = {};
  for (const event of events) {
    const current = vv[event.deviceId] || 0;
    if (event.seq > current) {
      vv[event.deviceId] = event.seq;
    }
  }
  return vv;
}

/**
 * Creates a new GroupEvent with monotonically increasing seq and Lamport clock.
 */
export function createGroupEvent(
  groupId: string,
  deviceId: string,
  type: GroupEventType,
  payload: unknown,
  existingEvents: GroupEvent[]
): GroupEvent {
  let myMaxSeq = 0;
  let maxSeenLc = 0;

  for (const e of existingEvents) {
    if (e.deviceId === deviceId && e.seq > myMaxSeq) {
      myMaxSeq = e.seq;
    }
    if (e.lc > maxSeenLc) {
      maxSeenLc = e.lc;
    }
  }

  const seq = myMaxSeq + 1;
  const lc = maxSeenLc + 1;
  const id = `${deviceId}:${seq}`;
  const ts = Date.now();

  return {
    id,
    groupId,
    deviceId,
    seq,
    lc,
    ts,
    type,
    payload,
  };
}

interface EntityWinner<T> {
  lc: number;
  deviceId: string;
  data: T;
  isDeleted: boolean;
}

/**
 * Replays an append-only event log to derive current group state.
 * Commutative and associative: event order in the array does not affect the derived result.
 */
export function deriveGroupState(groupId: string, events: GroupEvent[]): DerivedGroupState {
  let groupCreatedWinner: { lc: number; deviceId: string; payload: GroupCreatedPayload; ts: number } | null = null;
  let groupStatusWinner: { lc: number; deviceId: string; status: 'open' | 'closed' } | null = null;
  let groupKeyWinner: { lc: number; deviceId: string; key: string } | null = null;

  const memberWinners = new Map<string, { lc: number; deviceId: string; member: Member }>();
  const memberClaimWinners = new Map<string, { lc: number; deviceId: string; deviceIdClaim: string }>();
  const memberRenameWinners = new Map<string, { lc: number; deviceId: string; name: string }>();

  const expenseWinners = new Map<string, EntityWinner<Expense>>();
  const settlementWinners = new Map<string, EntityWinner<Settlement>>();

  let maxLc = 0;

  for (const event of events) {
    if (event.groupId !== groupId) continue;

    if (event.lc > maxLc) {
      maxLc = event.lc;
    }

    const orderMeta = { lc: event.lc, deviceId: event.deviceId };

    switch (event.type) {
      case 'group_created': {
        const payload = event.payload as GroupCreatedPayload;
        if (!groupCreatedWinner || compareEventOrder(orderMeta, groupCreatedWinner) > 0) {
          groupCreatedWinner = { ...orderMeta, payload, ts: event.ts };
        }
        break;
      }

      case 'group_status': {
        const payload = event.payload as GroupStatusPayload;
        if (!groupStatusWinner || compareEventOrder(orderMeta, groupStatusWinner) > 0) {
          groupStatusWinner = { ...orderMeta, status: payload.status };
        }
        break;
      }

      case 'group_key_set': {
        const payload = event.payload as GroupKeySetPayload;
        if (!groupKeyWinner || compareEventOrder(orderMeta, groupKeyWinner) > 0) {
          groupKeyWinner = { ...orderMeta, key: payload.key };
        }
        break;
      }

      case 'member_added': {
        const payload = event.payload as MemberAddedPayload;
        const current = memberWinners.get(payload.member.id);
        if (!current || compareEventOrder(orderMeta, current) > 0) {
          memberWinners.set(payload.member.id, { ...orderMeta, member: payload.member });
        }
        break;
      }

      case 'member_claimed': {
        const payload = event.payload as MemberClaimedPayload;
        const current = memberClaimWinners.get(payload.memberId);
        if (!current || compareEventOrder(orderMeta, current) > 0) {
          memberClaimWinners.set(payload.memberId, { ...orderMeta, deviceIdClaim: payload.deviceId });
        }
        break;
      }

      case 'member_renamed': {
        const payload = event.payload as MemberRenamedPayload;
        const current = memberRenameWinners.get(payload.memberId);
        if (!current || compareEventOrder(orderMeta, current) > 0) {
          memberRenameWinners.set(payload.memberId, { ...orderMeta, name: payload.name });
        }
        break;
      }

      case 'expense_upserted': {
        const payload = event.payload as ExpenseUpsertedPayload;
        const current = expenseWinners.get(payload.expense.id);
        if (!current || compareEventOrder(orderMeta, current) > 0) {
          expenseWinners.set(payload.expense.id, {
            ...orderMeta,
            data: payload.expense,
            isDeleted: false,
          });
        }
        break;
      }

      case 'expense_deleted': {
        const payload = event.payload as ExpenseDeletedPayload;
        const current = expenseWinners.get(payload.expenseId);
        if (!current || compareEventOrder(orderMeta, current) > 0) {
          expenseWinners.set(payload.expenseId, {
            ...orderMeta,
            data: (current?.data || { id: payload.expenseId }) as Expense,
            isDeleted: true,
          });
        }
        break;
      }

      case 'settlement_upserted': {
        const payload = event.payload as SettlementUpsertedPayload;
        const current = settlementWinners.get(payload.settlement.id);
        if (!current || compareEventOrder(orderMeta, current) > 0) {
          settlementWinners.set(payload.settlement.id, {
            ...orderMeta,
            data: payload.settlement,
            isDeleted: false,
          });
        }
        break;
      }

      case 'settlement_deleted': {
        const payload = event.payload as SettlementDeletedPayload;
        const current = settlementWinners.get(payload.settlementId);
        if (!current || compareEventOrder(orderMeta, current) > 0) {
          settlementWinners.set(payload.settlementId, {
            ...orderMeta,
            data: (current?.data || { id: payload.settlementId }) as Settlement,
            isDeleted: true,
          });
        }
        break;
      }
    }
  }

  // Derive resolved members
  const members: Member[] = [];
  for (const [memberId, winner] of memberWinners.entries()) {
    const m = { ...winner.member };
    const claim = memberClaimWinners.get(memberId);
    if (claim) {
      m.claimedByDeviceId = claim.deviceIdClaim;
      m.kind = 'device';
    }
    const rename = memberRenameWinners.get(memberId);
    if (rename) {
      m.name = rename.name;
    }
    members.push(m);
  }

  // Derive active expenses (non-deleted)
  const expenses: Expense[] = [];
  for (const winner of expenseWinners.values()) {
    if (!winner.isDeleted && winner.data) {
      expenses.push(winner.data);
    }
  }
  expenses.sort((a, b) => b.date - a.date);

  // Derive active settlements (non-deleted)
  const settlements: Settlement[] = [];
  for (const winner of settlementWinners.values()) {
    if (!winner.isDeleted && winner.data) {
      settlements.push(winner.data);
    }
  }
  settlements.sort((a, b) => b.date - a.date);

  const name = groupCreatedWinner?.payload.name || 'Untitled Group';
  const type = groupCreatedWinner?.payload.type || 'other';
  const currency = groupCreatedWinner?.payload.currency || '$';
  const createdAt = groupCreatedWinner?.ts || Date.now();
  const status = groupStatusWinner?.status || 'open';

  return {
    id: groupId,
    name,
    type,
    currency,
    status,
    createdAt,
    members,
    expenses,
    settlements,
    versionVector: computeVersionVector(events),
    maxLc,
    groupKey: groupKeyWinner?.key,
  };
}
