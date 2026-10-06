import { createGroupEvent, deriveGroupState } from '../eventLog';
import { calculateDelta, mergeEvents, validateGroupEvent } from '../merge';

describe('Event Log, Merging, CRDT Commutativity and Associativity', () => {
  const groupId = 'group-101';
  const deviceA = 'device-A';
  const deviceB = 'device-B';

  test('createGroupEvent increments seq and Lamport clock monotonically', () => {
    const e1 = createGroupEvent(groupId, deviceA, 'group_created', { name: 'Trip', type: 'trip', currency: '$' }, []);
    expect(e1.seq).toBe(1);
    expect(e1.lc).toBe(1);
    expect(e1.id).toBe('device-A:1');

    const e2 = createGroupEvent(groupId, deviceA, 'member_added', { member: { id: 'm1', name: 'Alice', kind: 'device' } }, [e1]);
    expect(e2.seq).toBe(2);
    expect(e2.lc).toBe(2);
    expect(e2.id).toBe('device-A:2');
  });

  test('merge is idempotent: merging identical events twice has no effect', () => {
    const e1 = createGroupEvent(groupId, deviceA, 'group_created', { name: 'Trip', type: 'trip', currency: '$' }, []);
    const { mergedEvents, newEventsCount } = mergeEvents([e1], [e1]);

    expect(newEventsCount).toBe(0);
    expect(mergedEvents).toHaveLength(1);
  });

  test('merge is commutative: order of merging does not affect derived state', () => {
    // Device A creates group and member Alice
    const e1 = createGroupEvent(groupId, deviceA, 'group_created', { name: 'Roadtrip', type: 'trip', currency: '$' }, []);
    const e2 = createGroupEvent(groupId, deviceA, 'member_added', { member: { id: 'alice', name: 'Alice', kind: 'device' } }, [e1]);

    // Device B adds member Bob and creates an expense
    const e3 = createGroupEvent(groupId, deviceB, 'member_added', { member: { id: 'bob', name: 'Bob', kind: 'device' } }, [e1, e2]);
    const e4 = createGroupEvent(
      groupId,
      deviceB,
      'expense_upserted',
      {
        expense: {
          id: 'exp1',
          title: 'Gas',
          amountMinor: 5000,
          paidBy: 'bob',
          splitType: 'equal',
          participants: [{ memberId: 'alice' }, { memberId: 'bob' }],
          date: 1000,
        },
      },
      [e1, e2, e3]
    );

    // Merge in Order 1: e1, e2, e3, e4
    const resOrder1 = mergeEvents([], [e1, e2, e3, e4]);
    const state1 = deriveGroupState(groupId, resOrder1.mergedEvents);

    // Merge in Order 2: e4, e2, e1, e3
    const resOrder2 = mergeEvents([], [e4, e2, e1, e3]);
    const state2 = deriveGroupState(groupId, resOrder2.mergedEvents);

    expect(state1).toEqual(state2);
    expect(state1.name).toBe('Roadtrip');
    expect(state1.members).toHaveLength(2);
    expect(state1.expenses).toHaveLength(1);
    expect(state1.expenses[0].title).toBe('Gas');
  });

  test('merge is associative: (A + B) + C === A + (B + C)', () => {
    const e1 = createGroupEvent(groupId, deviceA, 'group_created', { name: 'Apartment', type: 'household', currency: '€' }, []);
    const e2 = createGroupEvent(groupId, deviceA, 'member_added', { member: { id: 'm1', name: 'Dave', kind: 'device' } }, [e1]);
    const e3 = createGroupEvent(groupId, deviceB, 'member_added', { member: { id: 'm2', name: 'Emma', kind: 'device' } }, [e1, e2]);

    const setA = [e1];
    const setB = [e2];
    const setC = [e3];

    // (A + B) + C
    const ab = mergeEvents(setA, setB).mergedEvents;
    const abc1 = mergeEvents(ab, setC).mergedEvents;
    const state1 = deriveGroupState(groupId, abc1);

    // A + (B + C)
    const bc = mergeEvents(setB, setC).mergedEvents;
    const abc2 = mergeEvents(setA, bc).mergedEvents;
    const state2 = deriveGroupState(groupId, abc2);

    expect(state1).toEqual(state2);
  });

  test('last-writer-wins deterministic tie-breaking for expense edit and deletion', () => {
    const e1 = createGroupEvent(groupId, deviceA, 'group_created', { name: 'G', type: 'trip', currency: '$' }, []);
    const e2 = createGroupEvent(
      groupId,
      deviceA,
      'expense_upserted',
      {
        expense: {
          id: 'exp1',
          title: 'Coffee',
          amountMinor: 400,
          paidBy: 'm1',
          splitType: 'equal',
          participants: [{ memberId: 'm1' }],
          date: 1000,
        },
      },
      [e1]
    );

    // Later delete event beats older upsert
    const e3 = createGroupEvent(groupId, deviceB, 'expense_deleted', { expenseId: 'exp1' }, [e1, e2]);
    const stateWithDelete = deriveGroupState(groupId, [e1, e2, e3]);
    expect(stateWithDelete.expenses).toHaveLength(0);

    // Newer upsert with higher lc beats older delete
    const e4 = createGroupEvent(
      groupId,
      deviceA,
      'expense_upserted',
      {
        expense: {
          id: 'exp1',
          title: 'Special Coffee',
          amountMinor: 600,
          paidBy: 'm1',
          splitType: 'equal',
          participants: [{ memberId: 'm1' }],
          date: 2000,
        },
      },
      [e1, e2, e3]
    );
    const stateResurrected = deriveGroupState(groupId, [e1, e2, e3, e4]);
    expect(stateResurrected.expenses).toHaveLength(1);
    expect(stateResurrected.expenses[0].title).toBe('Special Coffee');
  });

  test('version vector and delta calculation', () => {
    const eA1 = createGroupEvent(groupId, deviceA, 'group_created', { name: 'G', type: 'trip', currency: '$' }, []);
    const eA2 = createGroupEvent(groupId, deviceA, 'member_added', { member: { id: 'm1', name: 'M1', kind: 'device' } }, [eA1]);
    const eB1 = createGroupEvent(groupId, deviceB, 'member_added', { member: { id: 'm2', name: 'M2', kind: 'device' } }, [eA1]);

    const allEvents = [eA1, eA2, eB1];

    // Remote vector only has eA1 (deviceA: 1)
    const remoteVector = { [deviceA]: 1 };
    const delta = calculateDelta(allEvents, remoteVector);

    // Delta should contain eA2 (seq 2 > 1) and eB1 (deviceB not in remote vector)
    expect(delta).toHaveLength(2);
    expect(delta.map((e) => e.id)).toContain('device-A:2');
    expect(delta.map((e) => e.id)).toContain('device-B:1');
  });

  test('untrusted input validation rejects corrupted or malicious events', () => {
    // Missing id or bad id format
    expect(validateGroupEvent({ id: 'badid', groupId, deviceId: deviceA, seq: 1, lc: 1, ts: 1, type: 'group_created', payload: {} }).valid).toBe(false);

    // Group ID mismatch
    const badGroup = createGroupEvent('other-group', deviceA, 'group_created', { name: 'X', type: 'trip', currency: '$' }, []);
    expect(validateGroupEvent(badGroup, groupId).valid).toBe(false);

    // Negative expense amount
    const badExpense = createGroupEvent(
      groupId,
      deviceA,
      'expense_upserted',
      {
        expense: {
          id: 'exp1',
          title: 'Hack',
          amountMinor: -1000,
          paidBy: 'm1',
          splitType: 'equal',
          participants: [{ memberId: 'm1' }],
          date: 1000,
        },
      },
      []
    );
    expect(validateGroupEvent(badExpense).valid).toBe(false);
  });
});
