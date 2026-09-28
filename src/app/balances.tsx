import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { AppSettings, DEFAULT_APP_SETTINGS, Transaction } from '@/types/finance';
import { loadAppSettings, loadTransactions } from '@/services/storage';

export default function BalancesScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const router = useRouter();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);

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

  // Expenditure summary for navigation card
  const { thisMonthExpense, expenseCount } = useMemo(() => {
    let monthExpense = 0;
    let expCount = 0;

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    for (const t of transactions) {
      if (t.type === 'expense') {
        expCount += 1;
        if (t.date >= startOfMonth) {
          monthExpense += t.amount;
        }
      }
    }

    return {
      thisMonthExpense: monthExpense,
      expenseCount: expCount,
    };
  }, [transactions]);

  // Unique accounts / cards count
  const accountsCount = useMemo(() => {
    const s = new Set<string>();
    transactions.forEach((t) => {
      if (t.source?.trim()) s.add(t.source.trim());
    });
    Object.keys(settings.cardNicknames || {}).forEach((k) => {
      if (k.trim()) s.add(k.trim());
    });
    return s.size;
  }, [transactions, settings.cardNicknames]);

  const formatAmount = (val: number) => {
    return Math.abs(val).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={[styles.screen, { backgroundColor: theme.background }]}>
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
              <ThemedText style={styles.backText}>Back</ThemedText>
            </Pressable>

            <ThemedText style={styles.navBarTitle} numberOfLines={1}>
              Balances
            </ThemedText>

            <View style={styles.navBarRightPlaceholder} />
          </View>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, Spacing.four) + 36 },
          ]}
          showsVerticalScrollIndicator={false}>
          {/* Summary / Expenditure Section */}
          <View style={styles.sectionContainer}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionHeader}>
              SUMMARY
            </ThemedText>

            <ThemedView type="backgroundElement" style={styles.card}>
              <Pressable
                onPress={() => router.push('/expenditure')}
                style={({ pressed }) => [styles.navRow, pressed && styles.btnPressed]}>
                <View style={styles.navRowLeft}>
                  <View style={styles.navIconContainer}>
                    <ThemedText style={styles.navIcon}>📊</ThemedText>
                  </View>
                  <View style={styles.navTextGroup}>
                    <ThemedText type="smallBold" style={styles.navTitle}>
                      Expenditure
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {thisMonthExpense > 0
                        ? `${currency} ${formatAmount(thisMonthExpense)} spent this month`
                        : 'Analyze spending by category and period'}
                    </ThemedText>
                  </View>
                </View>

                <View style={styles.navRowRight}>
                  {expenseCount > 0 && (
                    <View style={styles.navBadge}>
                      <ThemedText style={styles.navBadgeText}>
                        {currency} {formatAmount(thisMonthExpense)}
                      </ThemedText>
                    </View>
                  )}
                  <ThemedText style={styles.navChevron}>›</ThemedText>
                </View>
              </Pressable>
            </ThemedView>
          </View>

          {/* Accounts and Cards Section */}
          <View style={styles.sectionContainer}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionHeader}>
              ACCOUNTS & CARDS
            </ThemedText>

            <ThemedView type="backgroundElement" style={styles.card}>
              <Pressable
                onPress={() => router.push('/accounts')}
                style={({ pressed }) => [styles.navRow, pressed && styles.btnPressed]}>
                <View style={styles.navRowLeft}>
                  <View style={[styles.navIconContainer, { backgroundColor: 'rgba(59, 130, 246, 0.12)' }]}>
                    <ThemedText style={styles.navIcon}>💳</ThemedText>
                  </View>
                  <View style={styles.navTextGroup}>
                    <ThemedText type="smallBold" style={styles.navTitle}>
                      Accounts and Cards
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {accountsCount === 0
                        ? 'Manage cards and custom nicknames'
                        : `${accountsCount} card${accountsCount === 1 ? '' : 's'} & account${accountsCount === 1 ? '' : 's'} configured`}
                    </ThemedText>
                  </View>
                </View>

                <View style={styles.navRowRight}>
                  {accountsCount > 0 && (
                    <View style={[styles.navBadge, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                      <ThemedText style={[styles.navBadgeText, { color: '#3b82f6' }]}>
                        {accountsCount}
                      </ThemedText>
                    </View>
                  )}
                  <ThemedText style={styles.navChevron}>›</ThemedText>
                </View>
              </Pressable>
            </ThemedView>
          </View>
        </ScrollView>
      </View>
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
  navBarRightPlaceholder: {
    minWidth: 64,
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
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  btnPressed: {
    opacity: 0.8,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  navRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flex: 1,
  },
  navIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navIcon: {
    fontSize: 18,
  },
  navTextGroup: {
    flex: 1,
    gap: 2,
  },
  navTitle: {
    fontSize: 15,
  },
  navRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  navBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  navBadgeText: {
    color: '#f59e0b',
    fontSize: 12,
    fontWeight: '700',
  },
  navChevron: {
    fontSize: 22,
    fontWeight: '400',
    color: '#94a3b8',
    marginLeft: 2,
  },
  sectionContainer: {
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  sectionHeader: {
    paddingHorizontal: Spacing.one,
    fontSize: 12,
    letterSpacing: 0.8,
  },
});
