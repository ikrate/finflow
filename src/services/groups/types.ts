export type GroupType = 'trip' | 'event' | 'household' | 'other';
export type SplitType = 'equal' | 'exact' | 'percent' | 'shares';

export interface Member {
  id: string; // uuid
  name: string;
  kind: 'device' | 'ghost'; // ghost = person without the app
  claimedByDeviceId?: string; // set when a device claims a ghost
}

export interface GroupMeta {
  id: string;
  name: string;
  type: GroupType;
  currency: string;
  createdAt: number;
  myMemberId?: string;
  status: 'open' | 'closed';
  postedThrough?: number; // household only
  lastSyncedAt?: Record<string, number>; // memberId -> ms
  groupKey?: string;
  needsFirstSync?: boolean;
}

export type GroupEventType =
  | 'group_created'
  | 'member_added'
  | 'member_claimed'
  | 'member_renamed'
  | 'expense_upserted'
  | 'expense_deleted'
  | 'settlement_upserted'
  | 'settlement_deleted'
  | 'group_status'
  | 'group_key_set';

export interface GroupEvent {
  id: string; // `${deviceId}:${seq}`
  groupId: string;
  deviceId: string; // authoring device
  seq: number; // monotonic per device per group, starts at 1
  lc: number; // Lamport clock for ordering edits
  ts: number; // wall-clock ms, display only, never used for ordering
  type: GroupEventType;
  payload: unknown; // validated per type
}

export interface ExpenseParticipant {
  memberId: string;
  value?: number; // exact minor / percent*100 / share count
}

export interface Expense {
  id: string;
  title: string;
  amountMinor: number; // integer minor units (cents)
  paidBy: string; // memberId
  splitType: SplitType;
  participants: ExpenseParticipant[];
  date: number;
  note?: string;
}

export interface Settlement {
  id: string;
  from: string; // memberId
  to: string; // memberId
  amountMinor: number; // integer minor units (cents)
  date: number;
}

export type VersionVector = Record<string, number>; // deviceId -> maxSeq

// Payload interfaces for type safety
export interface GroupCreatedPayload {
  name: string;
  type: GroupType;
  currency: string;
}

export interface MemberAddedPayload {
  member: Member;
}

export interface MemberClaimedPayload {
  memberId: string;
  deviceId: string;
}

export interface MemberRenamedPayload {
  memberId: string;
  name: string;
}

export interface ExpenseUpsertedPayload {
  expense: Expense;
}

export interface ExpenseDeletedPayload {
  expenseId: string;
}

export interface SettlementUpsertedPayload {
  settlement: Settlement;
}

export interface SettlementDeletedPayload {
  settlementId: string;
}

export interface GroupStatusPayload {
  status: 'open' | 'closed';
}

export interface GroupKeySetPayload {
  key: string;
}

export interface DerivedGroupState {
  id: string;
  name: string;
  type: GroupType;
  currency: string;
  status: 'open' | 'closed';
  createdAt: number;
  members: Member[];
  expenses: Expense[];
  settlements: Settlement[];
  versionVector: VersionVector;
  maxLc: number;
  groupKey?: string;
}
