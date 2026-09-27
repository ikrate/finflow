import { Category } from '@/types/finance';

export interface CategoryMeta {
  label: string;
  icon: string;
  color: string;
  bg: string;
}

export const CATEGORY_MAP: Record<Category, CategoryMeta> = {
  Food: { label: 'Food & Dining', icon: '🍔', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' },
  Transport: { label: 'Transport', icon: '🚗', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)' },
  Shopping: { label: 'Shopping', icon: '🛍️', color: '#ec4899', bg: 'rgba(236, 72, 153, 0.12)' },
  Entertainment: { label: 'Entertainment', icon: '🎬', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)' },
  Bills: { label: 'Bills & Utilities', icon: '⚡', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)' },
  Salary: { label: 'Salary & Wage', icon: '💼', color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)' },
  Investments: { label: 'Investments', icon: '📈', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.12)' },
  Health: { label: 'Health & Medical', icon: '💊', color: '#14b8a6', bg: 'rgba(20, 184, 166, 0.12)' },
  Other: { label: 'Other', icon: '📦', color: '#64748b', bg: 'rgba(100, 116, 139, 0.12)' },
};

export const ALL_CATEGORIES: Category[] = [
  'Food',
  'Transport',
  'Shopping',
  'Entertainment',
  'Bills',
  'Salary',
  'Investments',
  'Health',
  'Other',
];

export function inferCategory(text: string): Category {
  const lower = text.toLowerCase();
  if (lower.includes('salary') || lower.includes('paycheck') || lower.includes('wage') || lower.includes('bonus')) return 'Salary';
  if (lower.includes('uber') || lower.includes('pickme') || lower.includes('lyft') || lower.includes('gas') || lower.includes('fuel') || lower.includes('train') || lower.includes('bus') || lower.includes('metro') || lower.includes('toll')) return 'Transport';
  if (lower.includes('food') || lower.includes('coffee') || lower.includes('lunch') || lower.includes('dinner') || lower.includes('breakfast') || lower.includes('grocery') || lower.includes('groceries') || lower.includes('burger') || lower.includes('restaurant') || lower.includes('starbucks') || lower.includes('mcdonald') || lower.includes('keells') || lower.includes('cargills') || lower.includes('spar') || lower.includes('pizza')) return 'Food';
  if (lower.includes('movie') || lower.includes('netflix') || lower.includes('spotify') || lower.includes('game') || lower.includes('concert') || lower.includes('cinema') || lower.includes('theatre')) return 'Entertainment';
  if (lower.includes('rent') || lower.includes('bill') || lower.includes('electric') || lower.includes('water') || lower.includes('internet') || lower.includes('utility') || lower.includes('wifi') || lower.includes('dialog') || lower.includes('mobitel') || lower.includes('ceb')) return 'Bills';
  if (lower.includes('amazon') || lower.includes('cloth') || lower.includes('shoes') || lower.includes('shop') || lower.includes('store') || lower.includes('apple store') || lower.includes('enterprise') || lower.includes('daraz') || lower.includes('mall') || lower.includes('retail')) return 'Shopping';
  if (lower.includes('doctor') || lower.includes('med') || lower.includes('gym') || lower.includes('fitness') || lower.includes('dentist') || lower.includes('pharmacy') || lower.includes('hospital')) return 'Health';
  if (lower.includes('stock') || lower.includes('crypto') || lower.includes('dividend') || lower.includes('invest') || lower.includes('etf')) return 'Investments';
  return 'Other';
}

