import { Member } from './types';

/**
 * Formats integer minor units (cents) into a clean currency string.
 * Example: 1550 cents with '$' -> '$ 15.50'
 */
export function formatMoney(amountMinor: number, currency = '$'): string {
  const isNegative = amountMinor < 0;
  const abs = Math.abs(amountMinor);
  const major = Math.floor(abs / 100);
  const minor = abs % 100;
  const formatted = `${major.toLocaleString()}.${minor.toString().padStart(2, '0')}`;
  return `${isNegative ? '-' : ''}${currency} ${formatted}`;
}

/**
 * Parses user input string (e.g. "15.50" or "15") into integer minor units (1550).
 */
export function parseMoneyToMinor(str: string): number {
  if (!str) return 0;
  const cleaned = str.replace(/[^0-9.]/g, '').trim();
  if (!cleaned) return 0;
  const parts = cleaned.split('.');
  const major = parseInt(parts[0] || '0', 10);
  let minor = 0;
  if (parts.length > 1) {
    const rawMinor = parts[1].slice(0, 2).padEnd(2, '0');
    minor = parseInt(rawMinor, 10);
  }
  return isNaN(major) || isNaN(minor) ? 0 : major * 100 + minor;
}

/**
 * Returns a mapping of memberId to disambiguated display name.
 * If two or more members share a name, adds suffix: "Sam", "Sam (2)", etc.
 */
export function getMemberDisplayNames(members: Member[]): Record<string, string> {
  const nameCounts: Record<string, number> = {};
  for (const m of members) {
    const trimmed = m.name.trim() || 'Anonymous';
    nameCounts[trimmed] = (nameCounts[trimmed] || 0) + 1;
  }

  const occurrences: Record<string, number> = {};
  const displayNames: Record<string, string> = {};

  for (const m of members) {
    const trimmed = m.name.trim() || 'Anonymous';
    if (nameCounts[trimmed] > 1) {
      occurrences[trimmed] = (occurrences[trimmed] || 0) + 1;
      const count = occurrences[trimmed];
      displayNames[m.id] = count === 1 ? trimmed : `${trimmed} (${count})`;
    } else {
      displayNames[m.id] = trimmed;
    }
  }

  return displayNames;
}
