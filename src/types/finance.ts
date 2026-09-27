export type TransactionType = 'income' | 'expense';

export type Category = 'Food' | 'Transport' | 'Shopping' | 'Entertainment' | 'Bills' | 'Salary' | 'Investments' | 'Health' | 'Other';

export interface Transaction {
  id: string;
  amount: number;
  type: TransactionType;
  title: string;
  category: string;
  date: number; // timestamp
}

export interface DateFilter {
  label: string;
  value: '7d' | '30d' | 'all';
}

export type TransactionFilter = 'all' | 'income' | 'expense';

export interface ThemeColors {
  text: string;
  textSecondary: string;
  background: string;
  backgroundSecondary: string;
  tint: string;
  tabIconDefault: string;
  tabIconSelected: string;
  border: string;
}

export interface AutomationConfig {
  autoSyncEnabled: boolean;
  fileUri: string | null;
  fileName: string | null;
  lastSyncedAt: number | null;
  lastSyncCount: number;
}

export interface AppSettings {
  currency: string;
  enableHaptics: boolean;
}

export const DEFAULT_AUTOMATION_CONFIG: AutomationConfig = {
  autoSyncEnabled: true,
  fileUri: null,
  fileName: null,
  lastSyncedAt: null,
  lastSyncCount: 0,
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  currency: 'LKR',
  enableHaptics: true,
};

export const CURRENCIES = [
  { symbol: '$', label: 'USD ($)' },
  { symbol: 'LKR', label: 'LKR (Rs)' },
  { symbol: '₹', label: 'INR (₹)' },
  { symbol: '€', label: 'EUR (€)' },
  { symbol: '£', label: 'GBP (£)' },
  { symbol: '¥', label: 'JPY (¥)' },
];
