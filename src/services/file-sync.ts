import * as FileSystem from 'expo-file-system/legacy';
import { Category, Transaction, TransactionType } from '@/types/finance';
import { ALL_CATEGORIES, findVendorCategory, inferCategory } from '@/utils/categories';
import { loadAppSettings } from '@/services/storage';
import FinflowIntentsModule from '../../modules/finflow-intents/src/FinflowIntentsModule';

export interface SyncResult {
  importedCount: number;
  totalLinesRead: number;
  transactions: Transaction[];
  error?: string;
}

export async function initDocumentsDirectory(): Promise<void> {
  // Setup logic no longer requires pending.csv initialization since we use App Intents exclusively.
}

/**
 * Detects whether a string is solely or primarily a currency amount.
 */
export function isPureAmountString(str: string): boolean {
  if (!str) return false;
  const trimmed = str.trim();
  return /^(?:rs\.?|lkr|usd|eur|gbp|inr|aud|cad|\$)?\s*[-+]?\d[\d,]*(?:\.\d{1,2})?\s*(?:rs\.?|lkr|usd|eur|gbp|inr|aud|cad)?$/i.test(trimmed);
}

/**
 * Extracts a numeric amount safely from text.
 */
export function extractAmount(str: string): number | null {
  if (!str) return null;
  const cleaned = str.replace(/(?:rs|lkr|usd|eur|gbp|inr|aud|cad|\$)\.?/gi, ' ').trim();
  const match = cleaned.match(/[-+]?\d[\d,]*(?:\.\d+)?/);
  if (!match) return null;
  const num = parseFloat(match[0].replace(/,/g, ''));
  return isNaN(num) || num <= 0 ? null : num;
}

/**
 * Intelligent parser for raw bank SMS messages like:
 * "NTB card debited by LKR 100"
 * "Transaction Approved on your Card 376657***2137 for LKR 2500.00 at DAMITH ENTERPRISE Available Bal LKR 139619.20"
 */
export function parseBankSMS(text: string, vendorCategories?: Record<string, Category>): Partial<Transaction> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Ignore lines that are purely balance info, OTPs, or greetings
  if (
    /^(?:avail(?:able)?\s+bal|bal|current\s+bal|closing\s+bal|total\s+bal|otp|dear\s+customer|thank\s+you|regards)/i.test(
      trimmed
    ) &&
    !/(?:debited|debit|spent|charged|credited|credit|paid|withdrawn|approved|txn)/i.test(trimmed)
  ) {
    return null;
  }

  // Extract amount
  let amount: number | null = null;
  const currencyAmountRegex = /(?:LKR|RS\.?|USD|EUR|GBP|AUD|CAD|INR|\$)\s*([\d,]+(?:\.\d{1,2})?)/gi;
  let match;
  let matches: number[] = [];
  while ((match = currencyAmountRegex.exec(trimmed)) !== null) {
      matches.push(parseFloat(match[1].replace(/,/g, '')));
  }
  
  if (matches.length > 0) {
      amount = matches[0];
  } else {
      const fallbackAmountMatch = trimmed.match(/(?:for|of|by)\s+([\d,]+(?:\.\d{1,2})?)/i);
      if (fallbackAmountMatch && fallbackAmountMatch[1]) {
          amount = parseFloat(fallbackAmountMatch[1].replace(/,/g, ''));
      }
  }

  if (!amount || isNaN(amount) || amount <= 0) {
    return null;
  }

  // Type detection
  const isIncome = /(?:credited|received|deposited|refund)/i.test(trimmed);
  const type: TransactionType = isIncome ? 'income' : 'expense';

  // Merchant detection
  let title = 'Expense';
  const atMatch = trimmed.match(/\b(?:at|to|in)\s+([A-Za-z0-9\s&'*-]+?)(?:\s+(?:on|using|via|ref|bal|avl|avail(?:able)?|dated|call|txn)\b|[.?!,;]|$)/i);
  
  if (atMatch && atMatch[1]) {
    title = atMatch[1].trim();
  } else {
    const cardMatch = trimmed.match(/([A-Za-z0-9]+\s+card|[A-Za-z0-9]+\s+bank|NTB|Seylan)/i);
    if (cardMatch) {
      title = cardMatch[1].trim();
    } else {
      title = isIncome ? 'Income' : 'Card Expense';
    }
  }

  // Source (Card/Account) detection
  let source: string | undefined = undefined;
  const sourceMatch = trimmed.match(/(?:your\s+)?((?:[A-Za-z0-9]+\s+)?(?:Card|A\/C|Account)\s+[\d*.]+|[A-Za-z0-9]+\s+Card\s+[\d*.]+)/i);
  if (sourceMatch && sourceMatch[1]) {
    source = sourceMatch[1].trim();
  }

  return {
    title,
    amount,
    type,
    category: inferCategory(title, vendorCategories),
    date: Date.now(),
    source,
  };
}

export function parseLine(line: string, vendorCategories?: Record<string, Category>): Partial<Transaction> | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  // Check if header line
  if (
    trimmed.toLowerCase().startsWith('date,') ||
    trimmed.toLowerCase().startsWith('amount,') ||
    trimmed.toLowerCase().startsWith('title,')
  ) {
    return null;
  }

  // 1. Check if it's a raw bank SMS message
  if (
    /(?:debited|credited|spent|charged|approved|lkr|usd|inr|eur|card)/i.test(trimmed) &&
    !trimmed.startsWith('{')
  ) {
    const smsParsed = parseBankSMS(trimmed, vendorCategories);
    if (smsParsed && smsParsed.amount) {
      return smsParsed;
    }
  }

  // 2. Handle JSON line
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const obj = JSON.parse(trimmed);
      const amount = extractAmount(String(obj.amount));
      if (amount && amount > 0) {
        const title = (obj.title || obj.merchant || obj.name || 'Expense').trim();
        const type: TransactionType = obj.type === 'income' ? 'income' : 'expense';
        const rawCat = obj.category?.toString();
        const category: Category =
          rawCat && (ALL_CATEGORIES as readonly string[]).includes(rawCat)
            ? (rawCat as Category)
            : inferCategory(title, vendorCategories);

        const date = obj.date ? new Date(obj.date).getTime() : Date.now();

        return {
          title,
          amount,
          type,
          category,
          date: isNaN(date) ? Date.now() : date,
        };
      }
    } catch {
      // Ignore JSON error and try CSV
    }
  }

  // 3. CSV parsing
  const delimiter = trimmed.includes(',') ? ',' : trimmed.includes('|') ? '|' : '\t';
  const parts = trimmed.split(delimiter).map((p) => p.trim().replace(/^["']|["']$/g, ''));

  if (parts.length === 0) return null;

  let amount: number | null = null;
  let title = 'Expense';
  let category: Category | null = null;
  let type: TransactionType = 'expense';
  let date = Date.now();

  function isDateString(str: string): boolean {
    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(str) || /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/.test(str)) {
      const timestamp = new Date(str).getTime();
      return !isNaN(timestamp);
    }
    return false;
  }

  let startIndex = 0;
  if (parts.length >= 3 && isDateString(parts[0])) {
    date = new Date(parts[0]).getTime();
    startIndex = 1;
  }

  const remaining = parts.slice(startIndex);

  if (remaining.length >= 2) {
    const p0IsAmt = isPureAmountString(remaining[0]);
    const p1IsAmt = isPureAmountString(remaining[1]);

    if (p0IsAmt && !p1IsAmt) {
      amount = extractAmount(remaining[0]);
      title = remaining[1];
    } else if (p1IsAmt && !p0IsAmt) {
      title = remaining[0];
      amount = extractAmount(remaining[1]);
    } else if (p0IsAmt && p1IsAmt) {
      amount = extractAmount(remaining[0]);
      title = remaining[1];
    } else {
      const a1 = extractAmount(remaining[1]);
      const a0 = extractAmount(remaining[0]);
      if (a1) {
        title = remaining[0];
        amount = a1;
      } else if (a0) {
        amount = a0;
        title = remaining[1];
      }
    }

    if (remaining[2]) {
      const catCandidate = remaining[2];
      if ((ALL_CATEGORIES as readonly string[]).includes(catCandidate)) {
        category = catCandidate as Category;
      } else if (/income/i.test(catCandidate)) {
        type = 'income';
      }
    }
    if (remaining[3]) {
      type = remaining[3].toLowerCase() === 'income' ? 'income' : 'expense';
    }
  } else if (remaining.length === 1) {
    amount = extractAmount(remaining[0]);
  }

  if (!amount || amount <= 0) return null;

  return {
    title: title || 'Expense',
    amount,
    type,
    category: category || inferCategory(title, vendorCategories),
    date,
  };
}

/**
 * Parses raw string content into transactions (used for deep-link imports).
 */
export function syncDirectContent(
  content: string,
  existingTransactions: Transaction[],
  vendorCategories?: Record<string, Category>
): SyncResult {
  const parsedCandidates: Partial<Transaction>[] = [];
  let totalLinesRead = 0;

  if (content && content.trim()) {
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      totalLinesRead++;
      const parsed = parseLine(trimmed, vendorCategories);
      if (parsed && parsed.amount && parsed.title) {
        parsedCandidates.push(parsed);
      }
    }
  }

  const transactions: Transaction[] = parsedCandidates.map((c, idx) => ({
    id: `sync_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 6)}`,
    title: c.title!,
    amount: c.amount!,
    type: c.type || 'expense',
    category: c.category || 'Other',
    date: c.date || Date.now(),
    notes: 'Auto-synced',
    source: c.source,
  }));

  return {
    importedCount: transactions.length,
    totalLinesRead,
    transactions,
  };
}

/**
 * CONSUME-AND-DELETE sync engine.
 *
 * How it works:
 * 1. Reads ALL pending files in the app's Documents directory.
 * 2. Parses every data line into transactions.
 * 3. CLEARS the file after successful import (writes back only the header comment).
 * 4. Returns the imported transactions to be merged into the app state.
 *
 * Because the file is cleared after each import, there is ZERO chance of
 * ghost transactions or duplicates. The file acts as a temporary queue —
 * Shortcuts appends lines, the app consumes them and empties the file.
 */
export async function autoSyncPendingFiles(
  _existingTransactions: Transaction[],
  vendorCategories?: Record<string, Category>
): Promise<SyncResult> {
  const allImported: Transaction[] = [];
  let totalLines = 0;
  let lastError: string | undefined;

  let activeVendorCategories = vendorCategories;
  if (!activeVendorCategories) {
    try {
      const settings = await loadAppSettings();
      activeVendorCategories = settings.vendorCategories;
    } catch {
      activeVendorCategories = undefined;
    }
  }

  // 1. Sync from iOS Native App Intents (Shortcut Storage)
  try {
    if (FinflowIntentsModule && FinflowIntentsModule.getRecords) {
      const records = await FinflowIntentsModule.getRecords();
      if (records.length > 0) {
        for (const record of records) {
          // If valid structured data
          if (record.amount !== undefined && record.amount > 0) {
            const title = record.text || record.category || 'Shortcut Input';
            const category: Category =
              findVendorCategory(title, activeVendorCategories) ||
              ((record.category && (ALL_CATEGORIES as readonly string[]).includes(record.category))
                ? (record.category as Category)
                : 'Other');

            allImported.push({
              id: `intent_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
              title,
              amount: record.amount,
              type: 'expense',
              category,
              date: new Date(record.timestamp).getTime(),
            });
          } else {
            // Fallback to parse Bank SMS if amount wasn't provided natively
            const result = parseLine(record.text, activeVendorCategories);
            if (result && result.amount && result.title) {
              allImported.push({
                id: `intent_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                title: result.title,
                amount: result.amount,
                type: result.type || 'expense',
                category: result.category || 'Other',
                date: new Date(record.timestamp).getTime(),
                source: result.source,
              });
            }
          }
        }
        await FinflowIntentsModule.clearRecords();
      }
    }
  } catch (err: any) {
    console.warn('[FinFlow FileSync] Error syncing from App Intents:', err?.message);
  }

  return {
    importedCount: allImported.length,
    totalLinesRead: totalLines,
    transactions: allImported,
    error: lastError,
  };
}
