import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Category, TransactionType, Transaction } from '@/types/finance';
import { ALL_CATEGORIES, CATEGORY_MAP } from '@/utils/categories';

interface AddTransactionModalProps {
  visible: boolean;
  onClose: () => void;
  onAdd: (data: {
    title: string;
    amount: number;
    type: TransactionType;
    category: Category;
  }) => void;
  currency?: string;
  initialTransaction?: Transaction | null;
}

export function AddTransactionModal({ visible, onClose, onAdd, currency = '$', initialTransaction }: AddTransactionModalProps) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  const [type, setType] = useState<TransactionType>('expense');
  const [amountStr, setAmountStr] = useState('');
  const [title, setTitle] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<Category>('Food');

  // Initialize fields if editing
  React.useEffect(() => {
    if (visible) {
      if (initialTransaction) {
        setType(initialTransaction.type);
        setAmountStr(initialTransaction.amount.toString());
        setTitle(initialTransaction.title);
        setSelectedCategory(initialTransaction.category as Category || 'Other');
      } else {
        setType('expense');
        setAmountStr('');
        setTitle('');
        setSelectedCategory('Food');
      }
    }
  }, [visible, initialTransaction]);

  // Auto-suggest category from title keywords
  const suggestedCategory = useMemo(() => {
    const lower = title.toLowerCase();
    if (lower.includes('salary') || lower.includes('paycheck') || lower.includes('bonus')) return 'Salary';
    if (lower.includes('uber') || lower.includes('lyft') || lower.includes('gas') || lower.includes('train') || lower.includes('bus')) return 'Transport';
    if (lower.includes('food') || lower.includes('coffee') || lower.includes('lunch') || lower.includes('dinner') || lower.includes('grocery') || lower.includes('burger')) return 'Food';
    if (lower.includes('movie') || lower.includes('netflix') || lower.includes('game') || lower.includes('concert')) return 'Entertainment';
    if (lower.includes('rent') || lower.includes('bill') || lower.includes('electric') || lower.includes('water') || lower.includes('internet')) return 'Bills';
    if (lower.includes('amazon') || lower.includes('cloth') || lower.includes('shoes') || lower.includes('shop')) return 'Shopping';
    if (lower.includes('doctor') || lower.includes('med') || lower.includes('gym') || lower.includes('dentist')) return 'Health';
    if (lower.includes('stock') || lower.includes('crypto') || lower.includes('dividend') || lower.includes('invest')) return 'Investments';
    return null;
  }, [title]);

  const activeCategory = suggestedCategory ?? selectedCategory;

  const handleSubmit = () => {
    const parsedAmount = parseFloat(amountStr);
    if (isNaN(parsedAmount) || parsedAmount <= 0) return;
    if (!title.trim()) return;

    onAdd({
      title: title.trim(),
      amount: parsedAmount,
      type,
      category: activeCategory,
    });

    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, Spacing.four) }]}>
          <ThemedView type="backgroundElement" style={styles.content}>
            {/* Header */}
            <View style={styles.header}>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.headerTitle}>
                {initialTransaction ? 'EDIT TRANSACTION' : 'NEW TRANSACTION'}
              </ThemedText>
              <Pressable hitSlop={10} onPress={onClose} style={styles.closeBtn}>
                <ThemedText style={styles.closeIcon}>✕</ThemedText>
              </Pressable>
            </View>

            {/* Income / Expense Switcher */}
            <View style={styles.typeSwitcher}>
              <Pressable
                onPress={() => setType('expense')}
                style={[styles.typeBtn, type === 'expense' && styles.typeBtnExpense]}>
                <ThemedText
                  style={[styles.typeBtnText, type === 'expense' && styles.typeBtnTextActive]}>
                  Expense
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={() => setType('income')}
                style={[styles.typeBtn, type === 'income' && styles.typeBtnIncome]}>
                <ThemedText
                  style={[styles.typeBtnText, type === 'income' && styles.typeBtnTextActive]}>
                  Income
                </ThemedText>
              </Pressable>
            </View>

            {/* Amount Input */}
            <View style={styles.amountContainer}>
              <ThemedText style={styles.currencySymbol}>{currency}</ThemedText>
              <TextInput
                value={amountStr}
                onChangeText={setAmountStr}
                placeholder="0.00"
                placeholderTextColor={theme.textSecondary}
                keyboardType="decimal-pad"
                autoFocus
                style={[styles.amountInput, { color: theme.text }]}
              />
            </View>

            {/* Title / Description */}
            <View style={[styles.inputBox, { borderColor: theme.backgroundSelected }]}>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="What was this for? (e.g. Groceries)"
                placeholderTextColor={theme.textSecondary}
                style={[styles.titleInput, { color: theme.text }]}
              />
            </View>

            {/* Category Selectors */}
            <View style={styles.categorySection}>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
                CATEGORY
              </ThemedText>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoryScroll}>
                {ALL_CATEGORIES.map((cat) => {
                  const isSelected = activeCategory === cat;
                  const meta = CATEGORY_MAP[cat];
                  return (
                    <Pressable
                      key={cat}
                      onPress={() => setSelectedCategory(cat)}
                      style={[
                        styles.categoryChip,
                        isSelected && { backgroundColor: meta.color, borderColor: meta.color },
                      ]}>
                      <ThemedText style={styles.chipIcon}>{meta.icon}</ThemedText>
                      <ThemedText
                        style={[
                          styles.chipLabel,
                          isSelected && { color: '#ffffff', fontWeight: '700' },
                        ]}>
                        {cat}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* Add Button */}
            <Pressable
              onPress={handleSubmit}
              disabled={!amountStr.trim() || !title.trim()}
              style={({ pressed }) => [
                styles.submitBtn,
                (!amountStr.trim() || !title.trim()) && styles.submitBtnDisabled,
                pressed && styles.submitBtnPressed,
              ]}>
              <ThemedText style={styles.submitBtnText}>
                {initialTransaction ? 'Save Changes' : 'Add Transaction'}
              </ThemedText>
            </Pressable>
          </ThemedView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheet: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
  },
  content: {
    borderRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 11,
    letterSpacing: 0.8,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(150, 150, 150, 0.15)',
  },
  closeIcon: {
    fontSize: 13,
    fontWeight: '700',
  },
  typeSwitcher: {
    flexDirection: 'row',
    backgroundColor: 'rgba(150, 150, 150, 0.12)',
    borderRadius: Spacing.two,
    padding: 3,
    gap: 4,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: Spacing.two,
    borderRadius: 6,
    alignItems: 'center',
  },
  typeBtnExpense: {
    backgroundColor: '#ef4444',
  },
  typeBtnIncome: {
    backgroundColor: '#10b981',
  },
  typeBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  typeBtnTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.two,
  },
  currencySymbol: {
    fontSize: 32,
    fontWeight: '700',
    marginRight: 4,
    lineHeight: 42, // Add line height to prevent clipping
    marginTop: 4, // Shift down to align with amount baseline
  },
  amountInput: {
    fontSize: 40,
    fontWeight: '800',
    minWidth: 120,
    textAlign: 'left',
    padding: 0,
  },
  inputBox: {
    borderRadius: Spacing.two,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    backgroundColor: 'rgba(150, 150, 150, 0.06)',
  },
  titleInput: {
    fontSize: 15,
    height: 36,
  },
  categorySection: {
    gap: Spacing.one,
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 0.8,
  },
  categoryScroll: {
    gap: 6,
    paddingVertical: 4,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(150, 150, 150, 0.12)',
  },
  chipIcon: {
    fontSize: 13,
  },
  chipLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  submitBtn: {
    backgroundColor: '#3b82f6',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.two,
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitBtnPressed: {
    backgroundColor: '#2563eb',
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
