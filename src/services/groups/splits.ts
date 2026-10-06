import { Expense, SplitType } from './types';

export interface SplitResult {
  shares: Record<string, number>; // memberId -> owed amount in minor units
  isValid: boolean;
  error?: string;
}

/**
 * Computes each participant's owed share in integer minor units (cents)
 * for equal, exact, percent, and shares split types.
 *
 * Deterministically distributes any rounding remainder one minor unit at a time
 * in ascending memberId order so the sum of shares always equals amountMinor exactly.
 */
export function calculateSplits(
  amountMinor: number,
  splitType: SplitType,
  participants: { memberId: string; value?: number }[]
): SplitResult {
  if (amountMinor <= 0 || !Number.isInteger(amountMinor)) {
    return { shares: {}, isValid: false, error: 'Amount must be a positive integer in minor units' };
  }

  if (!participants || participants.length === 0) {
    return { shares: {}, isValid: false, error: 'At least one participant is required' };
  }

  // Deduplicate and sort participants by memberId ascending
  const uniqueParticipantsMap = new Map<string, number | undefined>();
  for (const p of participants) {
    if (p.memberId) {
      uniqueParticipantsMap.set(p.memberId, p.value);
    }
  }

  const sortedParticipants = Array.from(uniqueParticipantsMap.entries())
    .map(([memberId, value]) => ({ memberId, value }))
    .sort((a, b) => a.memberId.localeCompare(b.memberId));

  const count = sortedParticipants.length;
  if (count === 0) {
    return { shares: {}, isValid: false, error: 'Valid participant IDs required' };
  }

  const resultShares: Record<string, number> = {};

  switch (splitType) {
    case 'equal': {
      const baseShare = Math.floor(amountMinor / count);
      let remainder = amountMinor - baseShare * count;

      for (let i = 0; i < count; i++) {
        const extra = remainder > 0 ? 1 : 0;
        if (remainder > 0) remainder--;
        resultShares[sortedParticipants[i].memberId] = baseShare + extra;
      }
      break;
    }

    case 'exact': {
      let sum = 0;
      for (const p of sortedParticipants) {
        const val = p.value ?? 0;
        if (val < 0 || !Number.isInteger(val)) {
          return { shares: {}, isValid: false, error: 'Exact amounts must be non-negative integers' };
        }
        sum += val;
        resultShares[p.memberId] = val;
      }

      if (sum !== amountMinor) {
        return {
          shares: resultShares,
          isValid: false,
          error: `Exact shares sum to ${sum}, but total amount is ${amountMinor}`,
        };
      }
      break;
    }

    case 'percent': {
      // Allow percentage as either whole percent (sum = 100) or hundredths (sum = 10000, e.g. basis points)
      let sumPercent = 0;
      for (const p of sortedParticipants) {
        const val = p.value ?? 0;
        if (val < 0) {
          return { shares: {}, isValid: false, error: 'Percentages cannot be negative' };
        }
        sumPercent += val;
      }

      const totalBasis = Math.abs(sumPercent - 100) < 0.001 ? 100 : Math.abs(sumPercent - 10000) < 0.001 ? 10000 : null;
      if (!totalBasis) {
        return {
          shares: {},
          isValid: false,
          error: `Percentages must sum to 100% (currently ${sumPercent})`,
        };
      }

      let distributedSum = 0;
      for (const p of sortedParticipants) {
        const val = p.value ?? 0;
        const share = Math.floor((amountMinor * val) / totalBasis);
        resultShares[p.memberId] = share;
        distributedSum += share;
      }

      let remainder = amountMinor - distributedSum;
      for (let i = 0; i < count && remainder > 0; i++) {
        resultShares[sortedParticipants[i].memberId] += 1;
        remainder--;
      }
      break;
    }

    case 'shares': {
      let totalShares = 0;
      for (const p of sortedParticipants) {
        const val = p.value ?? 1;
        if (val <= 0 || !Number.isInteger(val)) {
          return { shares: {}, isValid: false, error: 'Shares must be positive integers' };
        }
        totalShares += val;
      }

      if (totalShares === 0) {
        return { shares: {}, isValid: false, error: 'Total shares must be greater than 0' };
      }

      let distributedSum = 0;
      for (const p of sortedParticipants) {
        const val = p.value ?? 1;
        const share = Math.floor((amountMinor * val) / totalShares);
        resultShares[p.memberId] = share;
        distributedSum += share;
      }

      let remainder = amountMinor - distributedSum;
      for (let i = 0; i < count && remainder > 0; i++) {
        resultShares[sortedParticipants[i].memberId] += 1;
        remainder--;
      }
      break;
    }

    default:
      return { shares: {}, isValid: false, error: `Unknown split type: ${splitType}` };
  }

  // Safety check: ensure total shares always sum exactly to amountMinor
  const finalSum = Object.values(resultShares).reduce((acc, v) => acc + v, 0);
  if (finalSum !== amountMinor) {
    return { shares: resultShares, isValid: false, error: `Split totals mismatch: ${finalSum} vs ${amountMinor}` };
  }

  return { shares: resultShares, isValid: true };
}

/**
 * Calculates owed shares for an Expense object.
 */
export function getExpenseShares(expense: Expense): Record<string, number> {
  const result = calculateSplits(expense.amountMinor, expense.splitType, expense.participants);
  return result.isValid ? result.shares : {};
}
