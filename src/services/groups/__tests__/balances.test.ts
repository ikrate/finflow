import { calculateBalances, simplifyDebts } from '../balances';
import { Expense, Member, Settlement } from '../types';

describe('Balances calculation and debt simplification', () => {
  const members: Member[] = [
    { id: 'alice', name: 'Alice', kind: 'device' },
    { id: 'bob', name: 'Bob', kind: 'device' },
    { id: 'charlie', name: 'Charlie', kind: 'ghost' },
  ];

  test('balances across the group sum to zero', () => {
    const expenses: Expense[] = [
      {
        id: 'exp1',
        title: 'Dinner',
        amountMinor: 3000,
        paidBy: 'alice',
        splitType: 'equal',
        participants: [{ memberId: 'alice' }, { memberId: 'bob' }, { memberId: 'charlie' }],
        date: Date.now(),
      },
      {
        id: 'exp2',
        title: 'Taxi',
        amountMinor: 1500,
        paidBy: 'bob',
        splitType: 'equal',
        participants: [{ memberId: 'alice' }, { memberId: 'bob' }, { memberId: 'charlie' }],
        date: Date.now(),
      },
    ];

    const settlements: Settlement[] = [
      {
        id: 'set1',
        from: 'charlie',
        to: 'alice',
        amountMinor: 500,
        date: Date.now(),
      },
    ];

    const balances = calculateBalances(expenses, settlements, members);

    // Check individual numbers
    // Total expenses: 4500. Each owes 1500.
    // Alice paid 3000 exp, owed 1500 exp -> +1500 before settlement.
    // Charlie paid 500 settlement to Alice -> Alice received 500 settlement (-500 net), Charlie paid 500 settlement (+500 net).
    // Alice net = 1500 - 500 = +1000
    // Bob paid 1500 exp, owed 1500 exp, 0 settlements -> 0 net
    // Charlie paid 0 exp, owed 1500 exp, paid 500 settlement -> -1500 + 500 = -1000 net
    expect(balances['alice'].netBalance).toBe(1000);
    expect(balances['bob'].netBalance).toBe(0);
    expect(balances['charlie'].netBalance).toBe(-1000);

    // Sum of net balances must be exactly 0
    const totalNet = Object.values(balances).reduce((sum, b) => sum + b.netBalance, 0);
    expect(totalNet).toBe(0);
  });

  test('settlement zeros out exact balance between members', () => {
    const expenses: Expense[] = [
      {
        id: 'exp1',
        title: 'Lunch',
        amountMinor: 2000,
        paidBy: 'alice',
        splitType: 'equal',
        participants: [{ memberId: 'alice' }, { memberId: 'bob' }],
        date: Date.now(),
      },
    ];

    // Bob owes Alice 1000
    const initialBalances = calculateBalances(expenses, [], members);
    expect(initialBalances['alice'].netBalance).toBe(1000);
    expect(initialBalances['bob'].netBalance).toBe(-1000);

    // Bob pays Alice 1000 settlement
    const settlements: Settlement[] = [
      {
        id: 's1',
        from: 'bob',
        to: 'alice',
        amountMinor: 1000,
        date: Date.now(),
      },
    ];

    const settledBalances = calculateBalances(expenses, settlements, members);
    expect(settledBalances['alice'].netBalance).toBe(0);
    expect(settledBalances['bob'].netBalance).toBe(0);
  });

  test('simplifyDebts: minimizes transactions and settles all debts correctly', () => {
    // A owes B 10, B owes C 10 -> Simplified: A owes C 10
    const balances = {
      A: {
        memberId: 'A',
        totalPaid: 0,
        totalOwed: 1000,
        settlementsPaid: 0,
        settlementsReceived: 0,
        netBalance: -1000,
      },
      B: {
        memberId: 'B',
        totalPaid: 1000,
        totalOwed: 1000,
        settlementsPaid: 0,
        settlementsReceived: 0,
        netBalance: 0,
      },
      C: {
        memberId: 'C',
        totalPaid: 1000,
        totalOwed: 0,
        settlementsPaid: 0,
        settlementsReceived: 0,
        netBalance: 1000,
      },
    };

    const simplified = simplifyDebts(balances);
    expect(simplified).toHaveLength(1);
    expect(simplified[0]).toEqual({
      from: 'A',
      to: 'C',
      amountMinor: 1000,
    });
  });

  test('simplifyDebts: multi-party complex balances', () => {
    const balances = {
      A: { memberId: 'A', totalPaid: 0, totalOwed: 0, settlementsPaid: 0, settlementsReceived: 0, netBalance: -4000 },
      B: { memberId: 'B', totalPaid: 0, totalOwed: 0, settlementsPaid: 0, settlementsReceived: 0, netBalance: -2000 },
      C: { memberId: 'C', totalPaid: 0, totalOwed: 0, settlementsPaid: 0, settlementsReceived: 0, netBalance: 3000 },
      D: { memberId: 'D', totalPaid: 0, totalOwed: 0, settlementsPaid: 0, settlementsReceived: 0, netBalance: 3000 },
    };

    const simplified = simplifyDebts(balances);
    // Total transferred must equal total positive balance (6000)
    const totalTransferred = simplified.reduce((acc, s) => acc + s.amountMinor, 0);
    expect(totalTransferred).toBe(6000);

    // Sum of outflow per debtor matches their net balance
    const debtorOutflows: Record<string, number> = { A: 0, B: 0 };
    for (const s of simplified) {
      debtorOutflows[s.from] = (debtorOutflows[s.from] || 0) + s.amountMinor;
    }
    expect(debtorOutflows['A']).toBe(4000);
    expect(debtorOutflows['B']).toBe(2000);
  });
});
