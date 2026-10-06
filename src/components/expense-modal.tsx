import React, { useEffect, useMemo, useState } from 'react';
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
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { calculateSplits } from '@/services/groups/splits';
import { Expense, Member, SplitType } from '@/services/groups/types';
import { formatMoney, getMemberDisplayNames, parseMoneyToMinor } from '@/services/groups/utils';
import { generateUUID } from '@/services/groups/uuid';

interface ExpenseModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (expense: Expense) => void;
  onDelete?: (expenseId: string) => void;
  initialExpense?: Expense | null;
  members: Member[];
  myMemberId?: string;
  currency: string;
}

const SPLIT_TYPES: { key: SplitType; label: string }[] = [
  { key: 'equal', label: '=' },
  { key: 'exact', label: '1.23' },
  { key: 'percent', label: '%' },
  { key: 'shares', label: 'Shares' },
];

export function ExpenseModal({
  visible,
  onClose,
  onSave,
  onDelete,
  initialExpense,
  members,
  myMemberId,
  currency,
}: ExpenseModalProps) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  const [title, setTitle] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [paidBy, setPaidBy] = useState('');
  const [splitType, setSplitType] = useState<SplitType>('equal');
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');

  const displayNames = useMemo(() => getMemberDisplayNames(members), [members]);

  useEffect(() => {
    if (!visible) return;

    if (initialExpense) {
      setTitle(initialExpense.title);
      setAmountStr((initialExpense.amountMinor / 100).toFixed(2));
      setPaidBy(initialExpense.paidBy);
      setSplitType(initialExpense.splitType);
      setNote(initialExpense.note || '');

      const sel = new Set<string>();
      const vals: Record<string, string> = {};
      for (const p of initialExpense.participants) {
        sel.add(p.memberId);
        if (p.value !== undefined) {
          if (initialExpense.splitType === 'exact') {
            vals[p.memberId] = (p.value / 100).toFixed(2);
          } else {
            vals[p.memberId] = p.value.toString();
          }
        }
      }
      setSelectedMembers(sel);
      setCustomValues(vals);
    } else {
      setTitle('');
      setAmountStr('');
      setPaidBy(myMemberId || (members[0]?.id ?? ''));
      setSplitType('equal');
      setSelectedMembers(new Set(members.map((m) => m.id)));
      setCustomValues({});
      setNote('');
    }
  }, [visible, initialExpense, members, myMemberId]);

  const amountMinor = useMemo(() => parseMoneyToMinor(amountStr), [amountStr]);

  const participantsList = useMemo(() => {
    return Array.from(selectedMembers).map((memberId) => {
      let value: number | undefined = undefined;
      const rawVal = customValues[memberId] || '';

      if (splitType === 'exact') {
        value = parseMoneyToMinor(rawVal);
      } else if (splitType === 'percent') {
        const parsed = parseFloat(rawVal);
        value = isNaN(parsed) ? 0 : parsed;
      } else if (splitType === 'shares') {
        const parsed = parseInt(rawVal, 10);
        value = isNaN(parsed) || parsed < 1 ? 1 : parsed;
      }

      return { memberId, value };
    });
  }, [selectedMembers, customValues, splitType]);

  const splitResult = useMemo(() => {
    if (amountMinor <= 0 || selectedMembers.size === 0) {
      return { shares: {}, isValid: false };
    }
    return calculateSplits(amountMinor, splitType, participantsList);
  }, [amountMinor, splitType, participantsList, selectedMembers.size]);

  const toggleMemberSelection = (memberId: string) => {
    const next = new Set(selectedMembers);
    if (next.has(memberId)) {
      if (next.size > 1) {
        next.delete(memberId);
      }
    } else {
      next.add(memberId);
    }
    setSelectedMembers(next);
  };

  const handleCustomValueChange = (memberId: string, val: string) => {
    setCustomValues((prev) => ({ ...prev, [memberId]: val }));
  };

  const canSave = Boolean(
    title.trim() &&
    amountMinor > 0 &&
    paidBy &&
    splitResult.isValid &&
    selectedMembers.size > 0
  );

  const handleSave = () => {
    if (!canSave) return;

    const expense: Expense = {
      id: initialExpense ? initialExpense.id : generateUUID(),
      title: title.trim(),
      amountMinor,
      paidBy,
      splitType,
      participants: participantsList,
      date: initialExpense ? initialExpense.date : Date.now(),
      note: note.trim() || undefined,
    };

    onSave(expense);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, backgroundColor: theme.background }}>
        {/* Header */}
        <View style={[styles.navBar, { paddingTop: Math.max(insets.top, 12), backgroundColor: theme.background }]}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.navBtn}>
            <ThemedText style={styles.cancelText}>Cancel</ThemedText>
          </Pressable>
          <ThemedText style={styles.navTitle}>
            {initialExpense ? 'Edit Expense' : 'Add Expense'}
          </ThemedText>
          <Pressable
            onPress={handleSave}
            disabled={!canSave}
            hitSlop={12}
            style={[styles.navBtn, !canSave && styles.navBtnDisabled]}>
            <ThemedText style={[styles.saveText, !canSave && styles.saveTextDisabled]}>Save</ThemedText>
          </Pressable>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 20) + 24 }]}
          keyboardShouldPersistTaps="handled">
          {/* Title & Amount Card */}
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.fieldLabel}>
              DESCRIPTION
            </ThemedText>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Groceries, Dinner, Uber"
              placeholderTextColor="#94a3b8"
              maxLength={100}
              style={[
                styles.input,
                { color: theme.text, backgroundColor: theme.background, borderColor: 'rgba(150, 150, 150, 0.25)' },
              ]}
            />

            <ThemedText type="smallBold" themeColor="textSecondary" style={[styles.fieldLabel, { marginTop: Spacing.two }]}>
              TOTAL AMOUNT ({currency})
            </ThemedText>
            <View style={styles.amountRow}>
              <ThemedText style={styles.amountPrefix}>{currency}</ThemedText>
              <TextInput
                value={amountStr}
                onChangeText={setAmountStr}
                placeholder="0.00"
                placeholderTextColor="#94a3b8"
                keyboardType="decimal-pad"
                style={[
                  styles.amountInput,
                  { color: theme.text, backgroundColor: theme.background, borderColor: 'rgba(150, 150, 150, 0.25)' },
                ]}
              />
            </View>
          </ThemedView>

          {/* Paid By Selector */}
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.fieldLabel}>
              PAID BY
            </ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.payerList}>
              {members.map((m) => {
                const isSelected = paidBy === m.id;
                return (
                  <Pressable
                    key={m.id}
                    onPress={() => setPaidBy(m.id)}
                    style={[
                      styles.payerChip,
                      isSelected && styles.payerChipSelected,
                      { backgroundColor: isSelected ? '#3b82f6' : theme.background },
                    ]}>
                    <ThemedText style={[styles.payerText, isSelected && styles.payerTextSelected]}>
                      {displayNames[m.id] || m.name}
                      {m.id === myMemberId ? ' (You)' : ''}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </ThemedView>

          {/* Split Type Selector */}
          <ThemedView type="backgroundElement" style={styles.card}>
            <View style={styles.splitTypeHeader}>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.fieldLabel}>
                SPLIT METHOD
              </ThemedText>
            </View>

            <View style={styles.splitTypeRow}>
              {SPLIT_TYPES.map((st) => {
                const isSelected = splitType === st.key;
                return (
                  <Pressable
                    key={st.key}
                    onPress={() => setSplitType(st.key)}
                    style={[
                      styles.splitTypeBtn,
                      isSelected && styles.splitTypeBtnSelected,
                      { backgroundColor: isSelected ? '#3b82f6' : theme.background },
                    ]}>
                    <ThemedText style={[styles.splitTypeText, isSelected && styles.splitTypeTextSelected]}>
                      {st.label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>

            {/* Participants list */}
            <View style={styles.participantsSection}>
              <ThemedText type="smallBold" themeColor="textSecondary" style={{ marginBottom: Spacing.two }}>
                SPLIT WITH
              </ThemedText>

              {members.map((m) => {
                const isChecked = selectedMembers.has(m.id);
                const shareAmount = splitResult.shares[m.id] || 0;

                return (
                  <View key={m.id} style={styles.participantRow}>
                    <Pressable
                      onPress={() => toggleMemberSelection(m.id)}
                      style={styles.participantCheckRow}>
                      <View style={[styles.checkbox, isChecked && styles.checkboxChecked]}>
                        {isChecked && <ThemedText style={styles.checkMark}>✓</ThemedText>}
                      </View>
                      <ThemedText style={styles.participantName}>
                        {displayNames[m.id] || m.name}
                        {m.id === myMemberId ? ' (You)' : ''}
                      </ThemedText>
                    </Pressable>

                    <View style={styles.participantRight}>
                      {isChecked && splitType !== 'equal' && (
                        <TextInput
                          value={customValues[m.id] || ''}
                          onChangeText={(val) => handleCustomValueChange(m.id, val)}
                          placeholder={
                            splitType === 'exact' ? '0.00' : splitType === 'percent' ? '0%' : '1'
                          }
                          placeholderTextColor="#94a3b8"
                          keyboardType="numeric"
                          style={[
                            styles.customValInput,
                            { color: theme.text, backgroundColor: theme.background },
                          ]}
                        />
                      )}

                      {isChecked && (
                        <View style={styles.shareBadge}>
                          <ThemedText style={styles.shareBadgeText}>
                            {formatMoney(shareAmount, currency)}
                          </ThemedText>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}

              {!splitResult.isValid && splitResult.error && (
                <View style={styles.errorBox}>
                  <ThemedText style={styles.errorBoxText}>{splitResult.error}</ThemedText>
                </View>
              )}
            </View>
          </ThemedView>

          {/* Optional Note */}
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.fieldLabel}>
              NOTE (OPTIONAL)
            </ThemedText>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Add details, notes, or receipts info"
              placeholderTextColor="#94a3b8"
              maxLength={150}
              style={[
                styles.input,
                { color: theme.text, backgroundColor: theme.background, borderColor: 'rgba(150, 150, 150, 0.25)' },
              ]}
            />
          </ThemedView>

          {/* Delete Action if editing */}
          {initialExpense && onDelete && (
            <Pressable
              onPress={() => {
                onDelete(initialExpense.id);
                onClose();
              }}
              style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.7 }]}>
              <ThemedText style={styles.deleteBtnText}>Delete Expense</ThemedText>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(150, 150, 150, 0.2)',
  },
  navBtn: {
    minWidth: 60,
  },
  navBtnDisabled: {
    opacity: 0.4,
  },
  cancelText: {
    fontSize: 16,
    color: '#ef4444',
    fontWeight: '500',
  },
  navTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  saveText: {
    fontSize: 16,
    color: '#3b82f6',
    fontWeight: '700',
    textAlign: 'right',
  },
  saveTextDisabled: {
    color: '#94a3b8',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  card: {
    padding: Spacing.three,
    borderRadius: 14,
    gap: Spacing.one,
  },
  fieldLabel: {
    fontSize: 12,
    letterSpacing: 0.5,
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  amountPrefix: {
    fontSize: 22,
    fontWeight: '700',
  },
  amountInput: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 24,
    fontWeight: '700',
  },
  payerList: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  payerChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(150, 150, 150, 0.25)',
  },
  payerChipSelected: {
    borderColor: '#3b82f6',
  },
  payerText: {
    fontSize: 14,
    fontWeight: '500',
  },
  payerTextSelected: {
    color: '#ffffff',
    fontWeight: '700',
  },
  splitTypeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  splitTypeRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginVertical: Spacing.two,
  },
  splitTypeBtn: {
    flex: 1,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(150, 150, 150, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  splitTypeBtnSelected: {
    borderColor: '#3b82f6',
  },
  splitTypeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  splitTypeTextSelected: {
    color: '#ffffff',
  },
  participantsSection: {
    marginTop: Spacing.two,
    gap: Spacing.two,
  },
  participantRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  participantCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flex: 1,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#94a3b8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  checkMark: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  participantName: {
    fontSize: 15,
    fontWeight: '500',
  },
  participantRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  customValInput: {
    width: 70,
    height: 32,
    borderWidth: 1,
    borderColor: 'rgba(150, 150, 150, 0.3)',
    borderRadius: 6,
    paddingHorizontal: 8,
    fontSize: 14,
    textAlign: 'center',
  },
  shareBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    minWidth: 64,
    alignItems: 'flex-end',
  },
  shareBadgeText: {
    color: '#3b82f6',
    fontSize: 13,
    fontWeight: '600',
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 8,
    padding: 10,
    marginTop: Spacing.one,
  },
  errorBoxText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '500',
  },
  deleteBtn: {
    paddingVertical: 14,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderRadius: 10,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  deleteBtnText: {
    color: '#ef4444',
    fontSize: 15,
    fontWeight: '700',
  },
});
