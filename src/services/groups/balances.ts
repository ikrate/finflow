import { Expense, Member, Settlement } from './types';
import { getExpenseShares } from './splits';

export interface MemberBalance {
  memberId: string;
  totalPaid: number; // total paid for expenses
  totalOwed: number; // total owed for expenses
  settlementsPaid: number; // settlements paid out to others
  settlementsReceived: number; // settlements received from others
  netBalance: number; // positive = owed money, negative = owes money
}

export interface SimplifiedDebt {
  from: string; // memberId who owes
  to: string; // memberId who is owed
  amountMinor: number; // integer amount in minor units
}

/**
 * Calculates net balances for all members in a group.
 * Net balance = (expenses paid + settlements paid) - (expenses owed + settlements received).
 * Across the group, the sum of all net balances is guaranteed to equal 0.
 */
export function calculateBalances(
  expenses: Expense[],
  settlements: Settlement[],
  members: Member[]
): Record<string, MemberBalance> {
  const balances: Record<string, MemberBalance> = {};

  // Initialize for all known members
  for (const member of members) {
    balances[member.id] = {
      memberId: member.id,
      totalPaid: 0,
      totalOwed: 0,
      settlementsPaid: 0,
      settlementsReceived: 0,
      netBalance: 0,
    };
  }

  // Aggregate expenses
  for (const expense of expenses) {
    if (!balances[expense.paidBy]) {
      balances[expense.paidBy] = {
        memberId: expense.paidBy,
        totalPaid: 0,
        totalOwed: 0,
        settlementsPaid: 0,
        settlementsReceived: 0,
        netBalance: 0,
      };
    }
    balances[expense.paidBy].totalPaid += expense.amountMinor;

    const shares = getExpenseShares(expense);
    for (const [memberId, share] of Object.entries(shares)) {
      if (!balances[memberId]) {
        balances[memberId] = {
          memberId,
          totalPaid: 0,
          totalOwed: 0,
          settlementsPaid: 0,
          settlementsReceived: 0,
          netBalance: 0,
        };
      }
      balances[memberId].totalOwed += share;
    }
  }

  // Aggregate settlements
  for (const settlement of settlements) {
    if (!balances[settlement.from]) {
      balances[settlement.from] = {
        memberId: settlement.from,
        totalPaid: 0,
        totalOwed: 0,
        settlementsPaid: 0,
        settlementsReceived: 0,
        netBalance: 0,
      };
    }
    if (!balances[settlement.to]) {
      balances[settlement.to] = {
        memberId: settlement.to,
        totalPaid: 0,
        totalOwed: 0,
        settlementsPaid: 0,
        settlementsReceived: 0,
        netBalance: 0,
      };
    }

    balances[settlement.from].settlementsPaid += settlement.amountMinor;
    balances[settlement.to].settlementsReceived += settlement.amountMinor;
  }

  // Compute net balance:
  // (Total paid into expenses + settlements paid) - (Total owed for expenses + settlements received)
  for (const b of Object.values(balances)) {
    b.netBalance = b.totalPaid - b.totalOwed + b.settlementsPaid - b.settlementsReceived;
  }

  return balances;
}

/**
 * Greedy debt simplification algorithm.
 * Minimizes the number of transactions required to settle all debts.
 */
export function simplifyDebts(balances: Record<string, MemberBalance>): SimplifiedDebt[] {
  // Separate into debtors (< 0) and creditors (> 0)
  const debtors: { memberId: string; amount: number }[] = [];
  const creditors: { memberId: string; amount: number }[] = [];

  for (const b of Object.values(balances)) {
    if (b.netBalance < 0) {
      debtors.push({ memberId: b.memberId, amount: -b.netBalance });
    } else if (b.netBalance > 0) {
      creditors.push({ memberId: b.memberId, amount: b.netBalance });
    }
  }

  // Sort descending by amount to minimize total steps
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const simplified: SimplifiedDebt[] = [];
  let dIdx = 0;
  let cIdx = 0;

  while (dIdx < debtors.length && cIdx < creditors.length) {
    const debtor = debtors[dIdx];
    const creditor = creditors[cIdx];

    const settledAmount = Math.min(debtor.amount, creditor.amount);

    if (settledAmount > 0) {
      simplified.push({
        from: debtor.memberId,
        to: creditor.memberId,
        amountMinor: settledAmount,
      });

      debtor.amount -= settledAmount;
      creditor.amount -= settledAmount;
    }

    if (debtor.amount === 0) {
      dIdx++;
    }
    if (creditor.amount === 0) {
      cIdx++;
    }
  }

  return simplified;
}
