import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import * as Linking from 'expo-linking';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';

import { AddTransactionModal } from '@/components/add-transaction-modal';
import { BalanceCard } from '@/components/balance-card';
import { SidePanel } from '@/components/side-panel';
import { ThemedText } from '@/components/themed-text';
import { TransactionItem } from '@/components/transaction-item';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { autoSyncPendingFiles, initDocumentsDirectory, syncDirectContent } from '@/services/file-sync';
import {
  clearAllTransactions,
  DEFAULT_APP_SETTINGS,
  DEFAULT_AUTOMATION_CONFIG,
  loadAppSettings,
  loadAutomationConfig,
  loadTransactions,
  saveAppSettings,
  saveTransactions,
} from '@/services/storage';
import {
  AppSettings,
  AutomationConfig,
  Category,
  Transaction,
  TransactionFilter,
  TransactionType,
} from '@/types/finance';
import { ALL_CATEGORIES, findVendorCategory } from '@/utils/categories';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterType, setFilterType] = useState<TransactionFilter>('all');
  const [selectedCategory, setSelectedCategory] = useState<Category | 'All'>('All');
  const [selectedSource, setSelectedSource] = useState<string | 'All'>('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [syncBanner, setSyncBanner] = useState<string | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const sources = useMemo(() => {
    const s = new Set<string>();
    transactions.forEach((t) => {
      if (t.source) s.add(t.source);
    });
    return Array.from(s).sort();
  }, [transactions]);

  const showBanner = useCallback((msg: string) => {
    setSyncBanner(msg);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        setSyncBanner(null);
      });
    }, 3000);
  }, [fadeAnim]);


  // Navigation Drawer
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);

  const [automationConfig, setAutomationConfig] = useState<AutomationConfig>(DEFAULT_AUTOMATION_CONFIG);
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);

  const handleRenameCard = useCallback((sourceId: string, currentName: string) => {
    Alert.prompt(
      'Nickname Card',
      `Enter a nickname for ${sourceId}:`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: (newName?: string) => {
            if (newName && newName.trim()) {
              const updatedSettings = {
                ...appSettings,
                cardNicknames: {
                  ...(appSettings.cardNicknames || {}),
                  [sourceId]: newName.trim()
                }
              };
              setAppSettings(updatedSettings);
              saveAppSettings(updatedSettings);
            }
          }
        }
      ],
      'plain-text',
      currentName !== sourceId ? currentName : ''
    );
  }, [appSettings]);

  const updateAndPersist = useCallback((updated: Transaction[]) => {
    setTransactions(updated);
    saveTransactions(updated);
  }, []);

  // Deduplicated Auto-sync for cold-start, warm-start, continuous polling, and manual pull
  const performAutoSync = useCallback(
    async (currentTransactions: Transaction[], showSuccess = true) => {
      try {
        const result = await autoSyncPendingFiles(currentTransactions, appSettings.vendorCategories);
        if (result.importedCount > 0) {
          const updated = [...result.transactions, ...currentTransactions];
          setTransactions(updated);
          await saveTransactions(updated);
          if (showSuccess) {
            showBanner(
              `Auto-synced ${result.importedCount} transaction${result.importedCount > 1 ? 's' : ''}`
            );
          }
        }
      } catch (err) {
        console.warn('[FinFlow] AutoSync error:', err);
      }
    },
    [appSettings.vendorCategories]
  );

  // Pull-to-refresh handler
  const handlePullToRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const currentTxList = await loadTransactions();
      const result = await autoSyncPendingFiles(currentTxList, appSettings.vendorCategories);
      if (result.importedCount > 0) {
        const updated = [...result.transactions, ...currentTxList];
        setTransactions(updated);
        await saveTransactions(updated);
        showBanner(`Synced ${result.importedCount} new transaction${result.importedCount > 1 ? 's' : ''}`);
      } else {
        showBanner('All transactions up-to-date');
      }
    } catch (err) {
      console.warn('[FinFlow] Refresh sync error:', err);
    } finally {
      setRefreshing(false);
    }
  }, [appSettings.vendorCategories]);

  // Reload transactions and settings when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadTransactions().then(setTransactions);
      loadAppSettings().then(setAppSettings);
    }, [])
  );

  // Cold start, Warm start, continuous polling, and deep link listeners
  useEffect(() => {
    initDocumentsDirectory();

    // Cold start loading
    Promise.all([loadTransactions(), loadAutomationConfig(), loadAppSettings()]).then(
      async ([txList, autoCfg, appSet]) => {
        setTransactions(txList);
        setAutomationConfig(autoCfg);
        setAppSettings(appSet);
        setLoading(false);

        // Run auto-sync on cold start
        await performAutoSync(txList);
      }
    );

    // Warm start: app brought back to foreground from recents/background
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        loadTransactions().then((currentTxList) => {
          performAutoSync(currentTxList);
        });
      }
    });

    // Deep link listener (e.g. Shortcuts triggering finflow://add?text=...)
    const handleUrl = (event: { url: string }) => {
      try {
        const parsed = Linking.parse(event.url);
        const textParam = parsed.queryParams?.text || parsed.queryParams?.tx;
        if (textParam && typeof textParam === 'string') {
          loadTransactions().then((currentTxList) => {
            const directRes = syncDirectContent(textParam, currentTxList, appSettings.vendorCategories);
            if (directRes.importedCount > 0) {
              const updated = [...directRes.transactions, ...currentTxList];
              setTransactions(updated);
              saveTransactions(updated);
              showBanner(`Imported from Shortcut`);
            }
          });
        } else {
          loadTransactions().then((tx) => performAutoSync(tx));
        }
      } catch (err) {
        console.warn('[FinFlow] Deep link handle error:', err);
      }
    };

    const linkSub = Linking.addEventListener('url', handleUrl);
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl({ url });
    });

    // Continuous foreground polling: checks every 2.5 seconds while app is in active use
    let isPolling = false;
    const intervalTimer = setInterval(async () => {
      if (AppState.currentState !== 'active' || isPolling) return;
      isPolling = true;
      try {
        const currentTxList = await loadTransactions();
        await performAutoSync(currentTxList, true);
      } catch (err) {
        console.warn('[FinFlow] Continuous auto-sync error:', err);
      } finally {
        isPolling = false;
      }
    }, 2500);

    return () => {
      subscription.remove();
      linkSub.remove();
      clearInterval(intervalTimer);
    };
  }, [performAutoSync]);

  const handleAddTransaction = useCallback(
    async (data: {
      title: string;
      amount: number;
      type: TransactionType;
      category: Category;
      rememberVendorCategory?: boolean;
    }) => {
      // 1. Learn vendor default rule only for NEW transactions, without modifying existing rules or during edits
      if (!editingTransaction && data.rememberVendorCategory && data.title.trim()) {
        const cleanVendor = data.title.trim();
        const existingRule = findVendorCategory(cleanVendor, appSettings.vendorCategories);
        if (!existingRule) {
          const updatedVendorCategories = {
            ...(appSettings.vendorCategories || {}),
            [cleanVendor]: data.category,
          };
          const updatedSettings: AppSettings = {
            ...appSettings,
            vendorCategories: updatedVendorCategories,
          };
          setAppSettings(updatedSettings);
          await saveAppSettings(updatedSettings);
        }
      }

      // 2. Update/create only THIS transaction
      if (editingTransaction) {
        const updated = transactions.map((t) =>
          t.id === editingTransaction.id
            ? {
                ...t,
                title: data.title,
                amount: data.amount,
                type: data.type,
                category: data.category,
              }
            : t
        );
        updateAndPersist(updated);
        setEditingTransaction(null);
      } else {
        const newTransaction: Transaction = {
          id: Date.now().toString(),
          title: data.title,
          amount: data.amount,
          type: data.type,
          category: data.category,
          date: Date.now(),
        };
        const updated = [newTransaction, ...transactions];
        updateAndPersist(updated);
      }
    },
    [transactions, updateAndPersist, editingTransaction, appSettings]
  );

  const handleEdit = useCallback(
    (transaction: Transaction) => {
      setEditingTransaction(transaction);
      setIsModalOpen(true);
    },
    []
  );

  const handleDelete = useCallback(
    (id: string) => {
      const updated = transactions.filter((t) => t.id !== id);
      updateAndPersist(updated);
    },
    [transactions, updateAndPersist]
  );

  // Filtered transactions
  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (filterType === 'expense' && t.type !== 'expense') return false;
      if (filterType === 'income' && t.type !== 'income') return false;
      if (selectedCategory !== 'All' && t.category !== selectedCategory) return false;
      if (selectedSource !== 'All' && t.source !== selectedSource) return false;
      return true;
    });
  }, [transactions, filterType, selectedCategory, selectedSource]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.screen, { backgroundColor: theme.background }]}>
      {/* Pinned Sticky Header */}
      <View
        style={[
          styles.stickyHeaderWrapper,
          {
            paddingTop: Math.max(insets.top, Spacing.three),
            backgroundColor: theme.background,
          },
        ]}>
        <View style={styles.stickyHeaderContent}>
          <View style={styles.titleRow}>
            <View style={styles.titleLeftGroup}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open menu"
                hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                onPress={() => setIsSidePanelOpen(true)}
                style={({ pressed }) => [styles.menuBtn, pressed && styles.menuBtnPressed]}>
                <View style={[styles.menuStripe, { backgroundColor: theme.text }]} />
                <View style={[styles.menuStripe, { backgroundColor: theme.text }]} />
                <View style={[styles.menuStripe, { backgroundColor: theme.text }]} />
              </Pressable>
              <ThemedText type="title" style={styles.brandTitle}>
                FinFlow
              </ThemedText>
            </View>

          </View>
          <BalanceCard transactions={transactions} currency={appSettings.currency} />
        </View>
      </View>

      {/* Scrollable Transactions Area */}
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handlePullToRefresh}
            tintColor="#3b82f6"
            colors={['#3b82f6']}
          />
        }
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: Spacing.two,
            paddingBottom: Math.max(insets.bottom, 16) + 96,
          },
        ]}>
        <View style={styles.container}>
          {/* Type Filters (All, Expenses, Income) */}
          <View style={styles.filterSection}>
            <View style={styles.typeFilterRow}>
              {(['all', 'expense', 'income'] as TransactionFilter[]).map((f) => {
                const isActive = filterType === f;
                return (
                  <Pressable
                    key={f}
                    onPress={() => setFilterType(f)}
                    style={[styles.filterTab, isActive && styles.filterTabActive]}>
                    <ThemedText
                      style={[styles.filterTabText, isActive && styles.filterTabTextActive]}>
                      {f === 'all' ? 'All' : f === 'expense' ? 'Expenses' : 'Income'}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>

            {/* Category horizontal pills */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryScroll}>
              <Pressable
                onPress={() => setSelectedCategory('All')}
                style={[
                  styles.categoryChip,
                  selectedCategory === 'All' && styles.categoryChipActive,
                ]}>
                <ThemedText
                  style={[
                    styles.categoryChipText,
                    selectedCategory === 'All' && styles.categoryChipTextActive,
                  ]}>
                  #All
                </ThemedText>
              </Pressable>
              {ALL_CATEGORIES.map((cat) => {
                const isSelected = selectedCategory === cat;
                return (
                  <Pressable
                    key={cat}
                    onPress={() => setSelectedCategory(cat)}
                    style={[styles.categoryChip, isSelected && styles.categoryChipActive]}>
                    <ThemedText
                      style={[
                        styles.categoryChipText,
                        isSelected && styles.categoryChipTextActive,
                      ]}>
                      #{cat}
                    </ThemedText>
                  </Pressable>
                );
              })}
          </ScrollView>

            {/* Source (Card) horizontal pills */}
            {sources.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={[styles.categoryScroll, { marginTop: Spacing.two }]}>
                <Pressable
                  onPress={() => setSelectedSource('All')}
                  style={[
                    styles.categoryChip,
                    selectedSource === 'All' && styles.categoryChipActive,
                  ]}>
                  <ThemedText
                    style={[
                      styles.categoryChipText,
                      selectedSource === 'All' && styles.categoryChipTextActive,
                    ]}>
                    💳 All Cards
                  </ThemedText>
                </Pressable>
                {sources.map((src) => {
                  const isSelected = selectedSource === src;
                  const displayName = appSettings.cardNicknames?.[src] || src;
                  return (
                    <Pressable
                      key={src}
                      onPress={() => setSelectedSource(src)}
                      onLongPress={() => handleRenameCard(src, displayName)}
                      style={[styles.categoryChip, isSelected && styles.categoryChipActive]}>
                      <ThemedText
                        style={[
                          styles.categoryChipText,
                          isSelected && styles.categoryChipTextActive,
                        ]}>
                        💳 {displayName}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>

          {/* Section Header */}
          <View style={styles.listHeaderRow}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              TRANSACTIONS ({filtered.length})
            </ThemedText>
          </View>

          {/* Transactions List */}
          {loading ? (
            <ActivityIndicator size="large" color="#3b82f6" style={styles.loader} />
          ) : filtered.length === 0 ? (
            <View style={styles.emptyContainer}>
              <ThemedText type="default" themeColor="textSecondary" style={styles.emptyText}>
                press + to log a transaction
              </ThemedText>
            </View>
          ) : (
            <View style={styles.list}>
              {filtered.map((item) => (
                <TransactionItem
                  key={item.id}
                  transaction={item}
                  currency={appSettings.currency}
                  sourceDisplayName={item.source ? (appSettings.cardNicknames?.[item.source] || item.source) : undefined}
                  onDelete={handleDelete}
                  onEdit={handleEdit}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Sync Status Banner */}
      {syncBanner && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.syncBadgeContainer,
            { bottom: Math.max(insets.bottom, 16) + 96, opacity: fadeAnim },
          ]}>
          <View style={[styles.syncBadge, { backgroundColor: '#374151', borderColor: 'transparent' }]}>
            <ThemedText style={[styles.syncBadgeText, { color: '#ffffff', fontWeight: '500' }]}>{syncBanner}</ThemedText>
          </View>
        </Animated.View>
      )}

      {/* Floating Action Button (+) centered in the bottom */}
      <View
        pointerEvents="box-none"
        style={[
          styles.fabWrapper,
          { bottom: Math.max(insets.bottom, 16) + 16 },
        ]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add transaction"
          onPress={() => {
            setEditingTransaction(null);
            setIsModalOpen(true);
          }}
          style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}>
          <ThemedText style={styles.fabIcon}>+</ThemedText>
        </Pressable>
      </View>

      {/* Add/Edit Transaction Modal */}
      <AddTransactionModal
        visible={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingTransaction(null);
        }}
        onAdd={handleAddTransaction}
        currency={appSettings.currency}
        initialTransaction={editingTransaction}
        vendorCategories={appSettings.vendorCategories}
      />

      {/* Slideable Left Panel */}
      <SidePanel
        visible={isSidePanelOpen}
        onOpen={() => setIsSidePanelOpen(true)}
        onClose={() => setIsSidePanelOpen(false)}
        automationConfig={automationConfig}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  stickyHeaderWrapper: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    zIndex: 10,
  },
  stickyHeaderContent: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: 8,
    paddingBottom: Spacing.two,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  menuBtn: {
    paddingVertical: 8,
    paddingRight: 6,
    paddingLeft: 2,
    justifyContent: 'center',
    gap: 7,
  },
  menuBtnPressed: {
    opacity: 0.5,
  },
  menuStripe: {
    width: 28,
    height: 3.5,
    borderRadius: 2,
  },
  brandTitle: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  syncBadgeContainer: {
    position: 'absolute',
    width: '100%',
    alignItems: 'center',
    zIndex: 100,
  },
  syncBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10b981',
    borderWidth: 1,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    borderRadius: 12,
  },
  syncBadgeText: {
    color: '#10b981',
    fontSize: 11,
    fontWeight: '700',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
  },
  container: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.four,
  },
  filterSection: {
    gap: Spacing.two,
  },
  typeFilterRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  filterTab: {
    flex: 1,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    alignItems: 'center',
    backgroundColor: 'rgba(150, 150, 150, 0.1)',
  },
  filterTabActive: {
    backgroundColor: '#3b82f6',
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: '600',
  },
  filterTabTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  categoryScroll: {
    gap: Spacing.one,
    paddingVertical: 2,
  },
  categoryChip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(150, 150, 150, 0.1)',
  },
  categoryChipActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.18)',
    borderColor: '#3b82f6',
    borderWidth: 1,
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '500',
  },
  categoryChipTextActive: {
    color: '#3b82f6',
    fontWeight: '700',
  },
  listHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.one,
  },
  list: {
    gap: Spacing.two,
  },
  loader: {
    marginTop: Spacing.five,
  },
  emptyContainer: {
    paddingVertical: Spacing.six,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 15,
    textAlign: 'center',
  },
  fabWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  fab: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 8,
  },
  fabPressed: {
    transform: [{ scale: 0.92 }],
    backgroundColor: '#2563eb',
  },
  fabIcon: {
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '300',
    lineHeight: 38,
    marginTop: -2,
  },
});
