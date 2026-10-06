import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EndEventModal } from '@/components/end-event-modal';
import { ExpenseModal } from '@/components/expense-modal';
import { MemberModal } from '@/components/member-modal';
import { SettleUpModal } from '@/components/settle-up-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { calculateBalances, simplifyDebts, SimplifiedDebt } from '@/services/groups/balances';
import { createGroupEvent, deriveGroupState } from '@/services/groups/eventLog';
import { getExpenseShares } from '@/services/groups/splits';
import {
  getOrCreateDeviceId,
  loadGroupEvents,
  loadGroupsIndex,
  saveGroupEvents,
  upsertGroupMeta,
} from '@/services/groups/storage';
import {
  DerivedGroupState,
  Expense,
  GroupEvent,
  GroupMeta,
  GroupType,
  Member,
  Settlement,
} from '@/services/groups/types';
import { formatMoney, getMemberDisplayNames } from '@/services/groups/utils';
import { generateUUID } from '@/services/groups/uuid';
import { loadTransactions, saveTransactions } from '@/services/storage';
import { Category, Transaction } from '@/types/finance';

const TYPE_ICONS: Record<GroupType, string> = {
  trip: '✈️',
  event: '🎉',
  household: '🏠',
  other: '👥',
};

type TabType = 'expenses' | 'balances' | 'members';

export default function GroupDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useTheme();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('expenses');

  const [meta, setMeta] = useState<GroupMeta | null>(null);
  const [events, setEvents] = useState<GroupEvent[]>([]);
  const [state, setState] = useState<DerivedGroupState | null>(null);
  const [deviceId, setDeviceId] = useState<string>('');
  const [postedLedgerAmount, setPostedLedgerAmount] = useState<number | null>(null);

  // Modals state
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);
  const [settleSuggestion, setSettleSuggestion] = useState<SimplifiedDebt | null>(null);

  const [memberModalConfig, setMemberModalConfig] = useState<{
    visible: boolean;
    mode: 'add_ghost' | 'rename' | 'claim';
    member?: Member | null;
  }>({ visible: false, mode: 'add_ghost', member: null });

  const [isEndModalOpen, setIsEndModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const loadData = useCallback(async () => {
    if (!groupId) return;
    try {
      const [dId, allIndex, groupEvents, personalTxs] = await Promise.all([
        getOrCreateDeviceId(),
        loadGroupsIndex(),
        loadGroupEvents(groupId),
        loadTransactions(),
      ]);

      setDeviceId(dId);
      const foundMeta = allIndex.find((g) => g.id === groupId) || null;
      setMeta(foundMeta);
      setEvents(groupEvents);

      const derived = deriveGroupState(groupId, groupEvents);
      setState(derived);

      // Check if personal transaction exists for one-off groups
      const existingPersonal = personalTxs.find((t) => t.id === `group-${groupId}`);
      if (existingPersonal) {
        setPostedLedgerAmount(existingPersonal.amount);
      } else {
        setPostedLedgerAmount(null);
      }
    } catch (err) {
      console.warn('Failed to load group details', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [groupId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const myMemberId = meta?.myMemberId;
  const isClosed = state?.status === 'closed';
  const currency = state?.currency || '$';

  const displayNames = useMemo(() => {
    return state ? getMemberDisplayNames(state.members) : {};
  }, [state]);

  const balances = useMemo(() => {
    if (!state) return {};
    return calculateBalances(state.expenses, state.settlements, state.members);
  }, [state]);

  const simplifiedDebtsList = useMemo(() => {
    return simplifyDebts(balances);
  }, [balances]);

  const myNetBalance = useMemo(() => {
    if (!myMemberId || !balances[myMemberId]) return 0;
    return balances[myMemberId].netBalance;
  }, [myMemberId, balances]);

  const totalSpendingMinor = useMemo(() => {
    if (!state) return 0;
    return state.expenses.reduce((sum, e) => sum + e.amountMinor, 0);
  }, [state]);

  // Calculate my total share across all non-deleted expenses
  const myTotalShareMinor = useMemo(() => {
    if (!state || !myMemberId) return 0;
    let share = 0;
    for (const exp of state.expenses) {
      const shares = getExpenseShares(exp);
      if (shares[myMemberId]) {
        share += shares[myMemberId];
      }
    }
    return share;
  }, [state, myMemberId]);

  // Check if group changed since posting to personal ledger
  const myTotalShareMajor = myTotalShareMinor / 100;
  const showLedgerUpdateBanner = Boolean(
    isClosed &&
    postedLedgerAmount !== null &&
    Math.abs(postedLedgerAmount - myTotalShareMajor) > 0.009
  );

  // Emit a new event and save state
  const emitEvent = async (type: GroupEvent['type'], payload: unknown) => {
    if (!groupId) return;
    const newEvent = createGroupEvent(groupId, deviceId, type, payload, events);
    const updatedEvents = [...events, newEvent];
    setEvents(updatedEvents);

    const updatedState = deriveGroupState(groupId, updatedEvents);
    setState(updatedState);

    await saveGroupEvents(groupId, updatedEvents, true);

    if (meta) {
      const updatedMeta: GroupMeta = {
        ...meta,
        name: updatedState.name,
        status: updatedState.status,
      };
      setMeta(updatedMeta);
      await upsertGroupMeta(updatedMeta);
    }
  };

  // Expense Actions
  const handleSaveExpense = async (expense: Expense) => {
    if (isClosed) {
      Alert.alert('Group Ended', 'Expenses cannot be added or edited in an ended group.');
      return;
    }
    await emitEvent('expense_upserted', { expense });
  };

  const handleDeleteExpense = async (expenseId: string) => {
    if (isClosed) {
      Alert.alert('Group Ended', 'Expenses cannot be deleted in an ended group.');
      return;
    }
    await emitEvent('expense_deleted', { expenseId });
  };

  // Settlement Actions
  const handleRecordSettlement = async (settlement: Settlement) => {
    await emitEvent('settlement_upserted', { settlement });
  };

  // Member Actions
  const handleAddGhost = async (name: string) => {
    const member: Member = {
      id: generateUUID(),
      name,
      kind: 'ghost',
    };
    await emitEvent('member_added', { member });
  };

  const handleRenameMember = async (memberId: string, newName: string) => {
    await emitEvent('member_renamed', { memberId, name: newName });
  };

  const handleClaimGhost = async (memberId: string) => {
    await emitEvent('member_claimed', { memberId, deviceId });
    if (meta) {
      const updatedMeta = { ...meta, myMemberId: memberId };
      setMeta(updatedMeta);
      await upsertGroupMeta(updatedMeta);
    }
  };

  // Reopen Group
  const handleReopen = async () => {
    await emitEvent('group_status', { status: 'open' });
  };

  // End Event or Post My Share & Upsert into Personal Ledger
  const handleConfirmEndOrPost = async (category: Category) => {
    if (!meta || !state) return;

    const personalTxs = await loadTransactions();
    const now = Date.now();

    if (state.type === 'household') {
      const since = meta.postedThrough || 0;
      let shareSince = 0;
      for (const exp of state.expenses) {
        if (exp.date > since) {
          const shares = getExpenseShares(exp);
          if (myMemberId && shares[myMemberId]) {
            shareSince += shares[myMemberId];
          }
        }
      }

      const txId = `group-${meta.id}-${since}`;
      const amountMajor = shareSince / 100;

      const newTx: Transaction = {
        id: txId,
        type: 'expense',
        amount: amountMajor,
        title: `${state.name} Share`,
        category,
        date: now,
        source: `Group: ${state.name}`,
      };

      const filtered = personalTxs.filter((t) => t.id !== txId);
      await saveTransactions([newTx, ...filtered]);

      const updatedMeta: GroupMeta = {
        ...meta,
        postedThrough: now,
      };
      setMeta(updatedMeta);
      await upsertGroupMeta(updatedMeta);
    } else {
      // One-off groups: mark closed and upsert deterministic entry
      await emitEvent('group_status', { status: 'closed' });

      const txId = `group-${meta.id}`;
      const newTx: Transaction = {
        id: txId,
        type: 'expense',
        amount: myTotalShareMajor,
        title: state.name,
        category,
        date: now,
        source: `Group: ${state.name}`,
      };

      const filtered = personalTxs.filter((t) => t.id !== txId);
      await saveTransactions([newTx, ...filtered]);
      setPostedLedgerAmount(myTotalShareMajor);
    }
  };

  const handleUpdateLedgerEntry = async () => {
    if (!meta || !state) return;
    const personalTxs = await loadTransactions();
    const txId = `group-${meta.id}`;
    const existing = personalTxs.find((t) => t.id === txId);

    const updatedTx: Transaction = {
      id: txId,
      type: 'expense',
      amount: myTotalShareMajor,
      title: state.name,
      category: existing?.category || 'Other',
      date: Date.now(),
      source: `Group: ${state.name}`,
    };

    const filtered = personalTxs.filter((t) => t.id !== txId);
    await saveTransactions([updatedTx, ...filtered]);
    setPostedLedgerAmount(myTotalShareMajor);
  };

  if (loading || !state || !meta) {
    return (
      <View style={[styles.loadingScreen, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
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
            style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}>
            <ThemedText style={styles.backChevron}>‹</ThemedText>
            <ThemedText style={styles.backText}>Groups</ThemedText>
          </Pressable>

          <View style={styles.navTitleGroup}>
            <ThemedText style={styles.navBarTitle} numberOfLines={1}>
              {state.name}
            </ThemedText>
            {isClosed && (
              <View style={styles.navClosedBadge}>
                <ThemedText style={styles.navClosedBadgeText}>Ended</ThemedText>
              </View>
            )}
          </View>

          <View style={styles.navRightActions}>
            <Pressable
              hitSlop={8}
              onPress={() => router.push(`/groups/sync?groupId=${groupId}`)}
              style={styles.syncNavBtn}>
              <ThemedText style={styles.syncNavBtnText}>Sync</ThemedText>
            </Pressable>

            <Pressable hitSlop={8} onPress={() => setIsMenuOpen(true)} style={styles.menuNavBtn}>
              <ThemedText style={styles.menuNavBtnText}>•••</ThemedText>
            </Pressable>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, Spacing.four) + 70 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadData();
            }}
            tintColor="#3b82f6"
          />
        }
        showsVerticalScrollIndicator={false}>
        {/* Sync Discrepancy Banner */}
        {showLedgerUpdateBanner && (
          <ThemedView type="backgroundElement" style={styles.alertBanner}>
            <View style={styles.alertBannerTextGroup}>
              <ThemedText style={styles.alertBannerTitle}>Group changed since you posted</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Your share is now {formatMoney(myTotalShareMinor, currency)} (posted {currency} {postedLedgerAmount?.toFixed(2)}).
              </ThemedText>
            </View>
            <Pressable onPress={handleUpdateLedgerEntry} style={styles.alertBannerBtn}>
              <ThemedText style={styles.alertBannerBtnText}>Update Entry</ThemedText>
            </Pressable>
          </ThemedView>
        )}

        {/* Balance & Overview Card */}
        <ThemedView type="backgroundElement" style={styles.overviewCard}>
          <View style={styles.overviewTop}>
            <View>
              <ThemedText type="small" themeColor="textSecondary" style={styles.balanceStatusLabel}>
                {myNetBalance > 0 ? 'YOU ARE OWED' : myNetBalance < 0 ? 'YOU OWE' : 'YOU ARE ALL SETTLED'}
              </ThemedText>
              <ThemedText
                style={[
                  styles.myNetAmount,
                  myNetBalance > 0 && styles.textGreen,
                  myNetBalance < 0 && styles.textRed,
                ]}>
                {formatMoney(myNetBalance, currency)}
              </ThemedText>
            </View>

            <View style={styles.groupTotalBox}>
              <ThemedText type="small" themeColor="textSecondary">Total Group Spending</ThemedText>
              <ThemedText style={styles.groupTotalAmount}>
                {formatMoney(totalSpendingMinor, currency)}
              </ThemedText>
            </View>
          </View>

          <View style={styles.quickActionRow}>
            <Pressable
              onPress={() => {
                setSettleSuggestion(null);
                setIsSettleModalOpen(true);
              }}
              style={styles.quickActionBtn}>
              <ThemedText style={styles.quickActionBtnText}>🤝 Settle Up</ThemedText>
            </Pressable>

            <Pressable
              onPress={() => router.push(`/groups/sync?groupId=${groupId}&role=invite`)}
              style={styles.quickActionBtnSecondary}>
              <ThemedText style={styles.quickActionBtnSecondaryText}>📲 Invite (QR)</ThemedText>
            </Pressable>
          </View>
        </ThemedView>

        {/* Tab Selector */}
        <View style={styles.tabBar}>
          <Pressable
            onPress={() => setActiveTab('expenses')}
            style={[styles.tabItem, activeTab === 'expenses' && styles.tabItemActive]}>
            <ThemedText style={[styles.tabLabel, activeTab === 'expenses' && styles.tabLabelActive]}>
              Expenses ({state.expenses.length})
            </ThemedText>
          </Pressable>

          <Pressable
            onPress={() => setActiveTab('balances')}
            style={[styles.tabItem, activeTab === 'balances' && styles.tabItemActive]}>
            <ThemedText style={[styles.tabLabel, activeTab === 'balances' && styles.tabLabelActive]}>
              Balances
            </ThemedText>
          </Pressable>

          <Pressable
            onPress={() => setActiveTab('members')}
            style={[styles.tabItem, activeTab === 'members' && styles.tabItemActive]}>
            <ThemedText style={[styles.tabLabel, activeTab === 'members' && styles.tabLabelActive]}>
              Members ({state.members.length})
            </ThemedText>
          </Pressable>
        </View>

        {/* TAB 1: Expenses */}
        {activeTab === 'expenses' && (
          <View style={styles.tabContent}>
            {state.expenses.length === 0 ? (
              <ThemedView type="backgroundElement" style={styles.emptyCard}>
                <ThemedText style={styles.emptyIcon}>🧾</ThemedText>
                <ThemedText style={styles.emptyTitle}>No Expenses Added</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.emptySubtitle}>
                  {isClosed
                    ? 'This group is closed.'
                    : 'Tap the button below to add your first shared expense.'}
                </ThemedText>
              </ThemedView>
            ) : (
              state.expenses.map((expense) => {
                const payerName = displayNames[expense.paidBy] || 'Unknown Member';
                const isPaidByMe = expense.paidBy === myMemberId;
                const shares = getExpenseShares(expense);
                const myShare = myMemberId ? shares[myMemberId] || 0 : 0;
                const formattedDate = new Date(expense.date).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                });

                return (
                  <ThemedView key={expense.id} type="backgroundElement" style={styles.expenseItem}>
                    <Pressable
                      onPress={() => {
                        setEditingExpense(expense);
                        setIsExpenseModalOpen(true);
                      }}
                      style={({ pressed }) => [styles.expensePressable, pressed && { opacity: 0.8 }]}>
                      <View style={styles.expenseLeft}>
                        <ThemedText style={styles.expenseTitle} numberOfLines={1}>
                          {expense.title}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {isPaidByMe ? 'You' : payerName} paid {formatMoney(expense.amountMinor, currency)} • {formattedDate}
                        </ThemedText>
                      </View>

                      <View style={styles.expenseRight}>
                        <ThemedText style={styles.expenseShareAmount}>
                          {isPaidByMe
                            ? `+${formatMoney(expense.amountMinor - myShare, currency)}`
                            : myShare > 0
                            ? `-${formatMoney(myShare, currency)}`
                            : 'Not involved'}
                        </ThemedText>
                        <ThemedText
                          type="small"
                          themeColor="textSecondary"
                          style={{ fontSize: 11 }}>
                          {isPaidByMe ? 'you lent' : myShare > 0 ? 'your share' : ''}
                        </ThemedText>
                      </View>
                    </Pressable>
                  </ThemedView>
                );
              })
            )}
          </View>
        )}

        {/* TAB 2: Balances */}
        {activeTab === 'balances' && (
          <View style={styles.tabContent}>
            {/* Suggested payments */}
            <ThemedView type="backgroundElement" style={styles.sectionCard}>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionHeader}>
                SIMPLIFIED SETTLEMENTS
              </ThemedText>

              {simplifiedDebtsList.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary" style={{ paddingVertical: 8 }}>
                  Everyone is settled up! No transfers needed.
                </ThemedText>
              ) : (
                simplifiedDebtsList.map((debt, idx) => {
                  const fromName = displayNames[debt.from] || 'Member';
                  const toName = displayNames[debt.to] || 'Member';

                  return (
                    <View key={idx} style={styles.settleRow}>
                      <View style={{ flex: 1 }}>
                        <ThemedText style={styles.settleText}>
                          <ThemedText style={{ fontWeight: '700' }}>{fromName}</ThemedText>
                          {' owes '}
                          <ThemedText style={{ fontWeight: '700' }}>{toName}</ThemedText>
                        </ThemedText>
                        <ThemedText style={styles.settleAmount}>
                          {formatMoney(debt.amountMinor, currency)}
                        </ThemedText>
                      </View>

                      <Pressable
                        onPress={() => {
                          setSettleSuggestion(debt);
                          setIsSettleModalOpen(true);
                        }}
                        style={styles.settleRowBtn}>
                        <ThemedText style={styles.settleRowBtnText}>Settle</ThemedText>
                      </Pressable>
                    </View>
                  );
                })
              )}
            </ThemedView>

            {/* Individual member net balances */}
            <ThemedView type="backgroundElement" style={styles.sectionCard}>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionHeader}>
                ALL MEMBER BALANCES
              </ThemedText>

              {state.members.map((m) => {
                const bal = balances[m.id]?.netBalance || 0;
                const isMe = m.id === myMemberId;
                const name = displayNames[m.id] || m.name;

                return (
                  <View key={m.id} style={styles.memberBalanceRow}>
                    <View style={styles.memberInfo}>
                      <ThemedText style={styles.memberName}>
                        {name} {isMe ? '(You)' : ''}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {bal > 0 ? 'is owed' : bal < 0 ? 'owes' : 'settled'}
                      </ThemedText>
                    </View>

                    <ThemedText
                      style={[
                        styles.memberBalanceAmount,
                        bal > 0 && styles.textGreen,
                        bal < 0 && styles.textRed,
                      ]}>
                      {formatMoney(bal, currency)}
                    </ThemedText>
                  </View>
                );
              })}
            </ThemedView>
          </View>
        )}

        {/* TAB 3: Members */}
        {activeTab === 'members' && (
          <View style={styles.tabContent}>
            <View style={styles.membersActionsRow}>
              <Pressable
                onPress={() =>
                  setMemberModalConfig({
                    visible: true,
                    mode: 'add_ghost',
                    member: null,
                  })
                }
                style={styles.addGhostBtn}>
                <ThemedText style={styles.addGhostBtnText}>+ Add Person (No App)</ThemedText>
              </Pressable>
            </View>

            <View style={{ gap: Spacing.two }}>
              {state.members.map((m) => {
                const isMe = m.id === myMemberId;
                const isGhost = m.kind === 'ghost';
                const name = displayNames[m.id] || m.name;

                return (
                  <ThemedView key={m.id} type="backgroundElement" style={styles.memberCard}>
                    <View style={styles.memberCardLeft}>
                      <View style={styles.memberBadge}>
                        <ThemedText style={{ fontSize: 18 }}>
                          {isGhost ? '👤' : '📱'}
                        </ThemedText>
                      </View>
                      <View>
                        <ThemedText style={styles.memberNameText}>
                          {name} {isMe ? '(You)' : ''}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {isGhost ? 'No app (Ghost member)' : 'Synced device'}
                        </ThemedText>
                      </View>
                    </View>

                    <View style={styles.memberCardActions}>
                      {isGhost && !myMemberId && (
                        <Pressable
                          onPress={() =>
                            setMemberModalConfig({
                              visible: true,
                              mode: 'claim',
                              member: m,
                            })
                          }
                          style={styles.claimBtn}>
                          <ThemedText style={styles.claimBtnText}>Claim</ThemedText>
                        </Pressable>
                      )}

                      <Pressable
                        onPress={() =>
                          setMemberModalConfig({
                            visible: true,
                            mode: 'rename',
                            member: m,
                          })
                        }
                        style={styles.renameBtn}>
                        <ThemedText style={styles.renameBtnText}>Rename</ThemedText>
                      </Pressable>
                    </View>
                  </ThemedView>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Floating Add Expense Button (if open) */}
      {!isClosed && activeTab === 'expenses' && (
        <Pressable
          onPress={() => {
            setEditingExpense(null);
            setIsExpenseModalOpen(true);
          }}
          style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}>
          <ThemedText style={styles.fabText}>+ Add Expense</ThemedText>
        </Pressable>
      )}

      {/* Modals */}
      <ExpenseModal
        visible={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
        onSave={handleSaveExpense}
        onDelete={handleDeleteExpense}
        initialExpense={editingExpense}
        members={state.members}
        myMemberId={myMemberId}
        currency={currency}
      />

      <SettleUpModal
        visible={isSettleModalOpen}
        onClose={() => setIsSettleModalOpen(false)}
        onRecordSettlement={handleRecordSettlement}
        members={state.members}
        simplifiedDebts={simplifiedDebtsList}
        currency={currency}
        myMemberId={myMemberId}
        initialSuggestion={settleSuggestion}
      />

      <MemberModal
        visible={memberModalConfig.visible}
        mode={memberModalConfig.mode}
        memberToEdit={memberModalConfig.member}
        onClose={() => setMemberModalConfig({ visible: false, mode: 'add_ghost', member: null })}
        onAddGhost={handleAddGhost}
        onRename={handleRenameMember}
        onClaimGhost={handleClaimGhost}
      />

      <EndEventModal
        visible={isEndModalOpen}
        onClose={() => setIsEndModalOpen(false)}
        onConfirm={handleConfirmEndOrPost}
        groupName={state.name}
        isHousehold={state.type === 'household'}
        myShareMinor={myTotalShareMinor}
        currency={currency}
      />

      {/* Overflow Menu Modal */}
      <Modal visible={isMenuOpen} transparent animationType="fade" onRequestClose={() => setIsMenuOpen(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setIsMenuOpen(false)}>
          <ThemedView type="backgroundElement" style={styles.menuSheet}>
            <ThemedText type="smallBold" style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
              GROUP OPTIONS
            </ThemedText>

            <Pressable
              onPress={() => {
                setIsMenuOpen(false);
                router.push(`/groups/sync?groupId=${groupId}&role=invite`);
              }}
              style={styles.menuOption}>
              <ThemedText style={styles.menuOptionText}>📲 Show Invite QR</ThemedText>
            </Pressable>

            <Pressable
              onPress={() => {
                setIsMenuOpen(false);
                router.push(`/groups/sync?groupId=${groupId}`);
              }}
              style={styles.menuOption}>
              <ThemedText style={styles.menuOptionText}>🔄 Sync with Member</ThemedText>
            </Pressable>

            {state.type === 'household' ? (
              <Pressable
                onPress={() => {
                  setIsMenuOpen(false);
                  setIsEndModalOpen(true);
                }}
                style={styles.menuOption}>
                <ThemedText style={styles.menuOptionText}>🏠 Post My Share to Ledger</ThemedText>
              </Pressable>
            ) : isClosed ? (
              <Pressable
                onPress={() => {
                  setIsMenuOpen(false);
                  handleReopen();
                }}
                style={styles.menuOption}>
                <ThemedText style={styles.menuOptionText}>🔓 Reopen Group</ThemedText>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => {
                  setIsMenuOpen(false);
                  setIsEndModalOpen(true);
                }}
                style={styles.menuOption}>
                <ThemedText style={[styles.menuOptionText, { color: '#ef4444' }]}>
                  🏁 End Event & Post to Ledger
                </ThemedText>
              </Pressable>
            )}

            <Pressable onPress={() => setIsMenuOpen(false)} style={styles.menuCancelOption}>
              <ThemedText style={styles.menuCancelText}>Close</ThemedText>
            </Pressable>
          </ThemedView>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  navTitleGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  navBarTitle: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  navClosedBadge: {
    backgroundColor: 'rgba(150, 150, 150, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  navClosedBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  navRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  syncNavBtn: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
  },
  syncNavBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  menuNavBtn: {
    padding: 6,
  },
  menuNavBtnText: {
    fontSize: 18,
    fontWeight: '800',
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
  alertBanner: {
    padding: Spacing.three,
    borderRadius: 12,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  alertBannerTextGroup: {
    flex: 1,
    gap: 2,
  },
  alertBannerTitle: {
    fontWeight: '700',
    color: '#d97706',
    fontSize: 14,
  },
  alertBannerBtn: {
    backgroundColor: '#d97706',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  alertBannerBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  overviewCard: {
    padding: Spacing.three,
    borderRadius: 16,
    gap: Spacing.three,
  },
  overviewTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  balanceStatusLabel: {
    fontSize: 11,
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  myNetAmount: {
    fontSize: 26,
    fontWeight: '800',
    marginTop: 2,
  },
  groupTotalBox: {
    alignItems: 'flex-end',
  },
  groupTotalAmount: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 2,
  },
  textGreen: {
    color: '#10b981',
  },
  textRed: {
    color: '#ef4444',
  },
  quickActionRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  quickActionBtn: {
    flex: 1,
    height: 40,
    backgroundColor: '#3b82f6',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickActionBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  quickActionBtnSecondary: {
    flex: 1,
    height: 40,
    backgroundColor: 'rgba(150, 150, 150, 0.15)',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickActionBtnSecondaryText: {
    fontSize: 14,
    fontWeight: '600',
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(150, 150, 150, 0.2)',
  },
  tabItem: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomColor: '#3b82f6',
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94a3b8',
  },
  tabLabelActive: {
    color: '#3b82f6',
  },
  tabContent: {
    gap: Spacing.two,
    paddingTop: Spacing.one,
  },
  emptyCard: {
    padding: Spacing.five,
    borderRadius: 16,
    alignItems: 'center',
    gap: Spacing.two,
  },
  emptyIcon: {
    fontSize: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  emptySubtitle: {
    textAlign: 'center',
  },
  expenseItem: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  expensePressable: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
  },
  expenseLeft: {
    flex: 1,
    gap: 2,
  },
  expenseTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  expenseRight: {
    alignItems: 'flex-end',
  },
  expenseShareAmount: {
    fontSize: 15,
    fontWeight: '700',
  },
  sectionCard: {
    padding: Spacing.three,
    borderRadius: 14,
    gap: Spacing.two,
  },
  sectionHeader: {
    fontSize: 11,
    letterSpacing: 0.5,
  },
  settleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(150, 150, 150, 0.15)',
  },
  settleText: {
    fontSize: 14,
  },
  settleAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: '#3b82f6',
    marginTop: 2,
  },
  settleRowBtn: {
    backgroundColor: '#10b981',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  settleRowBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  memberBalanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  memberInfo: {
    gap: 2,
  },
  memberName: {
    fontSize: 15,
    fontWeight: '600',
  },
  memberBalanceAmount: {
    fontSize: 16,
    fontWeight: '700',
  },
  membersActionsRow: {
    marginBottom: Spacing.one,
  },
  addGhostBtn: {
    backgroundColor: '#3b82f6',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  addGhostBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  memberCard: {
    padding: Spacing.three,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  memberCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flex: 1,
  },
  memberBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(150, 150, 150, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberNameText: {
    fontSize: 15,
    fontWeight: '600',
  },
  memberCardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  claimBtn: {
    backgroundColor: '#10b981',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  claimBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  renameBtn: {
    backgroundColor: 'rgba(150, 150, 150, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  renameBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    backgroundColor: '#3b82f6',
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  fabText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.three,
    gap: 4,
  },
  menuOption: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  menuOptionText: {
    fontSize: 16,
    fontWeight: '600',
  },
  menuCancelOption: {
    marginTop: Spacing.two,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: 'rgba(150, 150, 150, 0.15)',
  },
  menuCancelText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
