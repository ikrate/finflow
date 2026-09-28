import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { AppSettings, DEFAULT_APP_SETTINGS, Transaction } from '@/types/finance';
import { loadAppSettings, loadTransactions, saveAppSettings } from '@/services/storage';

interface AccountItem {
  source: string;
  nickname: string;
  hasNickname: boolean;
  income: number;
  expense: number;
  net: number;
  count: number;
}

export default function AccountsAndCardsScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const router = useRouter();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);

  // Nickname modal state
  const [editingCardSource, setEditingCardSource] = useState<string | null>(null);
  const [nicknameInput, setNicknameInput] = useState('');

  // Add new card modal state
  const [isAddCardModalOpen, setIsAddCardModalOpen] = useState(false);
  const [newCardSource, setNewCardSource] = useState('');
  const [newCardNickname, setNewCardNickname] = useState('');

  const loadData = useCallback(async () => {
    const [loadedTxs, loadedSettings] = await Promise.all([
      loadTransactions(),
      loadAppSettings(),
    ]);
    setTransactions(loadedTxs);
    setSettings(loadedSettings);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const currency = settings.currency || '$';

  // Aggregate accounts and cards from transactions and saved nicknames
  const accountList = useMemo(() => {
    const map: Record<string, { income: number; expense: number; count: number }> = {};

    // 1. Collect from transactions
    transactions.forEach((t) => {
      const src = t.source?.trim() || 'Main Account';
      if (!map[src]) {
        map[src] = { income: 0, expense: 0, count: 0 };
      }
      map[src].count += 1;
      if (t.type === 'income') {
        map[src].income += t.amount;
      } else {
        map[src].expense += t.amount;
      }
    });

    // 2. Also ensure any cards configured in settings.cardNicknames are present
    const savedNicknames = settings.cardNicknames || {};
    Object.keys(savedNicknames).forEach((src) => {
      if (!map[src]) {
        map[src] = { income: 0, expense: 0, count: 0 };
      }
    });

    // 3. Transform to array
    const items: AccountItem[] = Object.entries(map).map(([source, stats]) => {
      const nickname = (savedNicknames[source] || '').trim();
      return {
        source,
        nickname,
        hasNickname: Boolean(nickname),
        income: stats.income,
        expense: stats.expense,
        net: stats.income - stats.expense,
        count: stats.count,
      };
    });

    // Sort: cards with nicknames/activity first
    return items.sort((a, b) => {
      if (a.hasNickname !== b.hasNickname) {
        return a.hasNickname ? -1 : 1;
      }
      return b.count - a.count;
    });
  }, [transactions, settings.cardNicknames]);

  const formatAmount = (val: number) => {
    return Math.abs(val).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const handleOpenNicknameModal = (source: string, currentNickname: string) => {
    setEditingCardSource(source);
    setNicknameInput(currentNickname);
  };

  const handleSaveNickname = async () => {
    if (!editingCardSource) return;

    const trimmed = nicknameInput.trim();
    const updatedNicknames = { ...(settings.cardNicknames || {}) };

    if (trimmed) {
      updatedNicknames[editingCardSource] = trimmed;
    } else {
      delete updatedNicknames[editingCardSource];
    }

    const updatedSettings: AppSettings = {
      ...settings,
      cardNicknames: updatedNicknames,
    };

    setSettings(updatedSettings);
    await saveAppSettings(updatedSettings);
    setEditingCardSource(null);
    setNicknameInput('');
  };

  const handleRemoveNickname = async () => {
    if (!editingCardSource) return;

    const updatedNicknames = { ...(settings.cardNicknames || {}) };
    delete updatedNicknames[editingCardSource];

    const updatedSettings: AppSettings = {
      ...settings,
      cardNicknames: updatedNicknames,
    };

    setSettings(updatedSettings);
    await saveAppSettings(updatedSettings);
    setEditingCardSource(null);
    setNicknameInput('');
  };

  const handleAddNewCard = async () => {
    const src = newCardSource.trim();
    if (!src) return;

    const nick = newCardNickname.trim();
    const updatedNicknames = { ...(settings.cardNicknames || {}) };
    if (nick) {
      updatedNicknames[src] = nick;
    } else if (!updatedNicknames[src]) {
      updatedNicknames[src] = '';
    }

    const updatedSettings: AppSettings = {
      ...settings,
      cardNicknames: updatedNicknames,
    };

    setSettings(updatedSettings);
    await saveAppSettings(updatedSettings);
    setNewCardSource('');
    setNewCardNickname('');
    setIsAddCardModalOpen(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.screen, { backgroundColor: theme.background }]}>
        {/* Navigation Bar */}
        <View
          style={[
            styles.navBar,
            {
              paddingTop: Math.max(insets.top, 10),
              backgroundColor: theme.background,
            },
          ]}>
          <View style={styles.navBarContent}>
            <Pressable
              hitSlop={12}
              onPress={router.back}
              style={({ pressed }) => [styles.backBtn, pressed && styles.btnPressed]}>
              <ThemedText style={styles.backChevron}>‹</ThemedText>
              <ThemedText style={styles.backText}>Balances</ThemedText>
            </Pressable>

            <ThemedText style={styles.navBarTitle} numberOfLines={1}>
              Accounts and Cards
            </ThemedText>

            <Pressable
              hitSlop={10}
              onPress={() => setIsAddCardModalOpen(true)}
              style={({ pressed }) => [styles.navBarRightBtn, pressed && styles.btnPressed]}>
              <ThemedText style={styles.navBarRightText}>+ Add</ThemedText>
            </Pressable>
          </View>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, Spacing.four) + 36 },
          ]}
          showsVerticalScrollIndicator={false}>


          {/* Cards & Accounts List */}
          <View style={styles.accountsListContainer}>
            {accountList.length === 0 ? (
              <ThemedView type="backgroundElement" style={styles.emptyCard}>
                <ThemedText style={styles.emptyIcon}>💳</ThemedText>
                <ThemedText type="smallBold" style={{ textAlign: 'center' }}>
                  No Cards or Accounts Found
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
                  Cards detected from transactions or added manually will appear here.
                </ThemedText>
                <Pressable
                  onPress={() => setIsAddCardModalOpen(true)}
                  style={styles.emptyAddBtn}>
                  <ThemedText style={styles.emptyAddBtnText}>+ Add Card or Account</ThemedText>
                </Pressable>
              </ThemedView>
            ) : (
              accountList.map((item) => {
                const isPositive = item.net >= 0;
                // If nickname exists, show nickname as the TITLE!
                const cardTitle = item.hasNickname ? item.nickname : item.source;
                const cardSubtitle = item.hasNickname
                  ? `${item.source} • ${item.count} transaction${item.count === 1 ? '' : 's'}`
                  : `${item.count} transaction${item.count === 1 ? '' : 's'}`;

                return (
                  <ThemedView key={item.source} type="backgroundElement" style={styles.accountCard}>
                    <Pressable
                      onPress={() => handleOpenNicknameModal(item.source, item.nickname)}
                      style={({ pressed }) => [styles.accountCardPressable, pressed && styles.btnPressed]}>
                      <View style={styles.cardHeaderRow}>
                        <View style={styles.cardLeft}>
                          <View
                            style={[
                              styles.cardIconContainer,
                              item.hasNickname && styles.cardIconContainerWithNick,
                            ]}>
                            <ThemedText style={styles.cardIcon}>💳</ThemedText>
                          </View>

                          <View style={styles.cardTextGroup}>
                            {/* Title: Nickname if available, else Card Source */}
                            <View style={styles.titleRow}>
                              <ThemedText type="smallBold" style={styles.accountTitle}>
                                {cardTitle}
                              </ThemedText>
                              {item.hasNickname && (
                                <View style={styles.nickBadge}>
                                  <ThemedText style={styles.nickBadgeText}>Nickname</ThemedText>
                                </View>
                              )}
                            </View>

                            {/* Subtitle: original card number/source and count */}
                            <ThemedText
                              type="code"
                              themeColor="textSecondary"
                              style={styles.accountSubtitle}>
                              {cardSubtitle}
                            </ThemedText>
                          </View>
                        </View>

                        {/* Balance on Right - Centered vertically in right corner */}
                        <View style={styles.cardRight}>
                          {item.count > 0 ? (
                            <ThemedText
                              type="smallBold"
                              style={[
                                styles.accountBalance,
                                { color: isPositive ? '#10b981' : '#ef4444' },
                              ]}>
                              {isPositive ? `+${currency} ` : `-${currency} `}
                              {formatAmount(item.net)}
                            </ThemedText>
                          ) : (
                            <ThemedText
                              type="code"
                              themeColor="textSecondary"
                              style={{ fontSize: 13, fontWeight: '600' }}>
                              No activity
                            </ThemedText>
                          )}
                        </View>
                      </View>

                      {/* Card Footer: Flow stats on left, pencil moved down on right */}
                      <View style={styles.cardFooter}>
                        <View style={styles.flowTags}>
                          {item.count > 0 ? (
                            <>
                              <View style={styles.flowTag}>
                                <ThemedText style={styles.incomeTagText}>
                                  ↓ +{currency}{formatAmount(item.income)}
                                </ThemedText>
                              </View>
                              <View style={styles.flowTag}>
                                <ThemedText style={styles.expenseTagText}>
                                  ↑ -{currency}{formatAmount(item.expense)}
                                </ThemedText>
                              </View>
                            </>
                          ) : (
                            <View />
                          )}
                        </View>

                        <View style={styles.pencilContainer}>
                          <Ionicons name="pencil" size={13} color="#94a3b8" style={styles.pencilIcon} />
                        </View>
                      </View>
                    </Pressable>
                  </ThemedView>
                );
              })
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Edit Nickname Modal */}
      <Modal visible={editingCardSource !== null} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ width: '100%', alignItems: 'center' }}>
            <ThemedView type="backgroundElement" style={styles.modalContent}>
              <ThemedText type="title" style={{ fontSize: 20 }}>
                {settings.cardNicknames?.[editingCardSource || ''] ? 'Edit Nickname' : 'Add Nickname'}
              </ThemedText>

              <ThemedText type="small" themeColor="textSecondary">
                Card Identifier: <ThemedText type="smallBold">{editingCardSource}</ThemedText>
              </ThemedText>

              <View style={styles.inputContainer}>
                <TextInput
                  value={nicknameInput}
                  onChangeText={setNicknameInput}
                  placeholder="e.g. Work Card, Main Debit, Savings"
                  placeholderTextColor="#94a3b8"
                  style={[styles.textInput, { color: theme.text }]}
                  autoFocus
                  autoCapitalize="words"
                />
              </View>

              <View style={styles.modalBtnRow}>
                {settings.cardNicknames?.[editingCardSource || ''] ? (
                  <Pressable onPress={handleRemoveNickname} style={styles.btnDanger}>
                    <ThemedText style={styles.btnDangerText}>Remove</ThemedText>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => setEditingCardSource(null)}
                    style={styles.btnCancel}>
                    <ThemedText style={styles.btnCancelText}>Cancel</ThemedText>
                  </Pressable>
                )}

                <Pressable onPress={handleSaveNickname} style={styles.btnApply}>
                  <ThemedText style={styles.btnApplyText}>Save</ThemedText>
                </Pressable>
              </View>
            </ThemedView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Add New Card Modal */}
      <Modal visible={isAddCardModalOpen} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ width: '100%', alignItems: 'center' }}>
            <ThemedView type="backgroundElement" style={styles.modalContent}>
              <ThemedText type="title" style={{ fontSize: 20 }}>
                Add Card / Account
              </ThemedText>

              <View style={{ gap: Spacing.two }}>
                <View>
                  <ThemedText type="smallBold" themeColor="textSecondary" style={{ marginBottom: 4 }}>
                    CARD OR ACCOUNT NAME
                  </ThemedText>
                  <TextInput
                    value={newCardSource}
                    onChangeText={setNewCardSource}
                    placeholder="e.g. Card 1234 or HNB Account"
                    placeholderTextColor="#94a3b8"
                    style={[styles.textInput, { color: theme.text }]}
                    autoFocus
                  />
                </View>

                <View>
                  <ThemedText type="smallBold" themeColor="textSecondary" style={{ marginBottom: 4 }}>
                    NICKNAME (OPTIONAL)
                  </ThemedText>
                  <TextInput
                    value={newCardNickname}
                    onChangeText={setNewCardNickname}
                    placeholder="e.g. Personal Credit, Salary"
                    placeholderTextColor="#94a3b8"
                    style={[styles.textInput, { color: theme.text }]}
                    autoCapitalize="words"
                  />
                </View>
              </View>

              <View style={styles.modalBtnRow}>
                <Pressable
                  onPress={() => setIsAddCardModalOpen(false)}
                  style={styles.btnCancel}>
                  <ThemedText style={styles.btnCancelText}>Cancel</ThemedText>
                </Pressable>

                <Pressable onPress={handleAddNewCard} style={styles.btnApply}>
                  <ThemedText style={styles.btnApplyText}>Add</ThemedText>
                </Pressable>
              </View>
            </ThemedView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  navBar: {
    width: '100%',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(150, 150, 150, 0.18)',
  },
  navBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    height: 46,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minWidth: 64,
  },
  backBtnPressed: {
    opacity: 0.5,
  },
  backChevron: {
    fontSize: 32,
    lineHeight: 32,
    fontWeight: '300',
    color: '#3b82f6',
    marginTop: -2,
  },
  backText: {
    fontSize: 17,
    fontWeight: '500',
    color: '#3b82f6',
  },
  navBarTitle: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    flex: 1,
  },
  navBarRightBtn: {
    minWidth: 64,
    alignItems: 'flex-end',
  },
  navBarRightText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3b82f6',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    gap: Spacing.three,
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.four,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },

  accountsListContainer: {
    gap: Spacing.two,
  },
  accountCard: {
    borderRadius: Spacing.three,
    overflow: 'hidden',
  },
  accountCardPressable: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  btnPressed: {
    opacity: 0.75,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flex: 1,
  },
  cardIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(150, 150, 150, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIconContainerWithNick: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
  },
  cardIcon: {
    fontSize: 18,
  },
  cardTextGroup: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  accountTitle: {
    fontSize: 15,
  },
  nickBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  nickBadgeText: {
    color: '#3b82f6',
    fontSize: 10,
    fontWeight: '700',
  },
  accountSubtitle: {
    fontSize: 11,
  },
  cardRight: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    marginLeft: Spacing.two,
  },
  accountBalance: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'right',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.one + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(150, 150, 150, 0.15)',
    marginTop: 2,
  },
  flowTags: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  flowTag: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pencilContainer: {
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pencilIcon: {
    transform: [{ scaleX: -1 }],
  },
  incomeTagText: {
    fontSize: 11,
    color: '#10b981',
    fontWeight: '600',
  },
  expenseTagText: {
    fontSize: 11,
    color: '#ef4444',
    fontWeight: '600',
  },
  emptyCard: {
    padding: Spacing.five,
    borderRadius: Spacing.three,
    alignItems: 'center',
    gap: Spacing.two,
  },
  emptyIcon: {
    fontSize: 36,
  },
  emptyAddBtn: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: Spacing.four,
    paddingVertical: 10,
    borderRadius: Spacing.two,
    marginTop: Spacing.two,
  },
  emptyAddBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    padding: Spacing.four,
    borderRadius: Spacing.three,
    gap: Spacing.three,
  },
  inputContainer: {
    width: '100%',
  },
  textInput: {
    backgroundColor: 'rgba(150, 150, 150, 0.1)',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
    fontSize: 15,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  btnCancel: {
    flex: 1,
    backgroundColor: 'rgba(150, 150, 150, 0.15)',
    paddingVertical: 12,
    borderRadius: Spacing.two,
    alignItems: 'center',
  },
  btnCancelText: {
    fontWeight: '600',
    fontSize: 14,
  },
  btnDanger: {
    flex: 1,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingVertical: 12,
    borderRadius: Spacing.two,
    alignItems: 'center',
  },
  btnDangerText: {
    color: '#ef4444',
    fontWeight: '700',
    fontSize: 14,
  },
  btnApply: {
    flex: 1,
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    borderRadius: Spacing.two,
    alignItems: 'center',
  },
  btnApplyText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
});
