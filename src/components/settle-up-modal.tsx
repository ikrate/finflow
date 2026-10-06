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
import { SimplifiedDebt } from '@/services/groups/balances';
import { Member, Settlement } from '@/services/groups/types';
import { formatMoney, getMemberDisplayNames, parseMoneyToMinor } from '@/services/groups/utils';
import { generateUUID } from '@/services/groups/uuid';

interface SettleUpModalProps {
  visible: boolean;
  onClose: () => void;
  onRecordSettlement: (settlement: Settlement) => void;
  members: Member[];
  simplifiedDebts: SimplifiedDebt[];
  currency: string;
  myMemberId?: string;
  initialSuggestion?: SimplifiedDebt | null;
}

export function SettleUpModal({
  visible,
  onClose,
  onRecordSettlement,
  members,
  simplifiedDebts,
  currency,
  myMemberId,
  initialSuggestion,
}: SettleUpModalProps) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  const [mode, setMode] = useState<'suggested' | 'custom'>('suggested');
  const [fromMember, setFromMember] = useState('');
  const [toMember, setToMember] = useState('');
  const [amountStr, setAmountStr] = useState('');

  const displayNames = useMemo(() => getMemberDisplayNames(members), [members]);

  useEffect(() => {
    if (!visible) return;

    if (initialSuggestion) {
      setFromMember(initialSuggestion.from);
      setToMember(initialSuggestion.to);
      setAmountStr((initialSuggestion.amountMinor / 100).toFixed(2));
      setMode('custom');
    } else {
      setMode(simplifiedDebts.length > 0 ? 'suggested' : 'custom');
      setFromMember(myMemberId || (members[0]?.id ?? ''));
      setToMember(members.find((m) => m.id !== myMemberId)?.id || (members[1]?.id ?? ''));
      setAmountStr('');
    }
  }, [visible, initialSuggestion, simplifiedDebts, members, myMemberId]);

  const amountMinor = useMemo(() => parseMoneyToMinor(amountStr), [amountStr]);

  const canSubmitCustom = Boolean(
    fromMember &&
    toMember &&
    fromMember !== toMember &&
    amountMinor > 0
  );

  const handleSettleSuggestion = (debt: SimplifiedDebt) => {
    const settlement: Settlement = {
      id: generateUUID(),
      from: debt.from,
      to: debt.to,
      amountMinor: debt.amountMinor,
      date: Date.now(),
    };
    onRecordSettlement(settlement);
    onClose();
  };

  const handleCustomSubmit = () => {
    if (!canSubmitCustom) return;

    const settlement: Settlement = {
      id: generateUUID(),
      from: fromMember,
      to: toMember,
      amountMinor,
      date: Date.now(),
    };
    onRecordSettlement(settlement);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, backgroundColor: theme.background }}>
        {/* Navigation Bar */}
        <View style={[styles.navBar, { paddingTop: Math.max(insets.top, 12), backgroundColor: theme.background }]}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.navBtn}>
            <ThemedText style={styles.cancelText}>Cancel</ThemedText>
          </Pressable>
          <ThemedText style={styles.navTitle}>Record Settlement</ThemedText>
          <View style={styles.navBtn} />
        </View>

        {/* Tab switch */}
        <View style={styles.tabContainer}>
          <Pressable
            onPress={() => setMode('suggested')}
            style={[styles.tabBtn, mode === 'suggested' && styles.tabBtnActive]}>
            <ThemedText style={[styles.tabText, mode === 'suggested' && styles.tabTextActive]}>
              Suggestions ({simplifiedDebts.length})
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => setMode('custom')}
            style={[styles.tabBtn, mode === 'custom' && styles.tabBtnActive]}>
            <ThemedText style={[styles.tabText, mode === 'custom' && styles.tabTextActive]}>
              Custom Payment
            </ThemedText>
          </Pressable>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 20) + 24 }]}
          keyboardShouldPersistTaps="handled">
          {mode === 'suggested' ? (
            <View style={styles.suggestedList}>
              {simplifiedDebts.length === 0 ? (
                <View style={styles.emptyBox}>
                  <ThemedText style={styles.emptyIcon}>🎉</ThemedText>
                  <ThemedText style={styles.emptyTitle}>All Settled Up!</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.emptySubtitle}>
                    There are no outstanding debts to settle.
                  </ThemedText>
                </View>
              ) : (
                simplifiedDebts.map((debt, index) => {
                  const fromName = displayNames[debt.from] || 'Member';
                  const toName = displayNames[debt.to] || 'Member';
                  const isMeInvolved = debt.from === myMemberId || debt.to === myMemberId;

                  return (
                    <ThemedView key={index} type="backgroundElement" style={styles.debtCard}>
                      <View style={styles.debtInfo}>
                        <ThemedText style={styles.debtNames}>
                          <ThemedText style={{ fontWeight: '700' }}>{fromName}</ThemedText>
                          {' pays '}
                          <ThemedText style={{ fontWeight: '700' }}>{toName}</ThemedText>
                        </ThemedText>
                        <ThemedText style={styles.debtAmount}>
                          {formatMoney(debt.amountMinor, currency)}
                        </ThemedText>
                        {isMeInvolved && (
                          <ThemedText type="small" themeColor="textSecondary">
                            {debt.from === myMemberId ? 'You pay this' : 'You receive this'}
                          </ThemedText>
                        )}
                      </View>

                      <Pressable
                        onPress={() => handleSettleSuggestion(debt)}
                        style={({ pressed }) => [styles.settleBtn, pressed && { opacity: 0.8 }]}>
                        <ThemedText style={styles.settleBtnText}>Settle</ThemedText>
                      </Pressable>
                    </ThemedView>
                  );
                })
              )}
            </View>
          ) : (
            <View style={styles.customForm}>
              {/* Payer (From) */}
              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText type="smallBold" themeColor="textSecondary" style={styles.fieldLabel}>
                  WHO PAID? (FROM)
                </ThemedText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.memberChips}>
                  {members.map((m) => {
                    const isSelected = fromMember === m.id;
                    return (
                      <Pressable
                        key={m.id}
                        onPress={() => setFromMember(m.id)}
                        style={[
                          styles.chip,
                          isSelected && styles.chipSelected,
                          { backgroundColor: isSelected ? '#3b82f6' : theme.background },
                        ]}>
                        <ThemedText style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                          {displayNames[m.id] || m.name}
                          {m.id === myMemberId ? ' (You)' : ''}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </ThemedView>

              {/* Recipient (To) */}
              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText type="smallBold" themeColor="textSecondary" style={styles.fieldLabel}>
                  WHO RECEIVED? (TO)
                </ThemedText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.memberChips}>
                  {members.map((m) => {
                    const isSelected = toMember === m.id;
                    const isSame = fromMember === m.id;
                    return (
                      <Pressable
                        key={m.id}
                        onPress={() => !isSame && setToMember(m.id)}
                        disabled={isSame}
                        style={[
                          styles.chip,
                          isSelected && styles.chipSelected,
                          isSame && { opacity: 0.3 },
                          { backgroundColor: isSelected ? '#10b981' : theme.background },
                        ]}>
                        <ThemedText style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                          {displayNames[m.id] || m.name}
                          {m.id === myMemberId ? ' (You)' : ''}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </ThemedView>

              {/* Amount */}
              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText type="smallBold" themeColor="textSecondary" style={styles.fieldLabel}>
                  AMOUNT ({currency})
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

              <Pressable
                onPress={handleCustomSubmit}
                disabled={!canSubmitCustom}
                style={({ pressed }) => [
                  styles.submitBtn,
                  !canSubmitCustom && styles.submitBtnDisabled,
                  pressed && { opacity: 0.8 },
                ]}>
                <ThemedText style={styles.submitBtnText}>Record Payment</ThemedText>
              </Pressable>
            </View>
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
  cancelText: {
    fontSize: 16,
    color: '#ef4444',
    fontWeight: '500',
  },
  navTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: 'rgba(150, 150, 150, 0.12)',
  },
  tabBtnActive: {
    backgroundColor: '#3b82f6',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#ffffff',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  suggestedList: {
    gap: Spacing.two,
  },
  debtCard: {
    padding: Spacing.three,
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  debtInfo: {
    flex: 1,
    gap: 4,
  },
  debtNames: {
    fontSize: 15,
  },
  debtAmount: {
    fontSize: 18,
    fontWeight: '800',
    color: '#3b82f6',
  },
  settleBtn: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  settleBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  emptyBox: {
    padding: Spacing.five,
    alignItems: 'center',
    gap: Spacing.two,
  },
  emptyIcon: {
    fontSize: 48,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  emptySubtitle: {
    textAlign: 'center',
  },
  customForm: {
    gap: Spacing.three,
  },
  card: {
    padding: Spacing.three,
    borderRadius: 14,
    gap: Spacing.two,
  },
  fieldLabel: {
    fontSize: 12,
    letterSpacing: 0.5,
  },
  memberChips: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(150, 150, 150, 0.25)',
  },
  chipSelected: {
    borderColor: 'transparent',
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
  },
  chipTextSelected: {
    color: '#ffffff',
    fontWeight: '700',
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
  submitBtn: {
    height: 48,
    backgroundColor: '#10b981',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
