import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { Transaction } from '@/types/finance';

interface BalanceCardProps {
  transactions: Transaction[];
  currency?: string;
}

export function BalanceCard({ transactions, currency = '$' }: BalanceCardProps) {
  const { totalIncome, totalExpense, balance } = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const t of transactions) {
      if (t.type === 'income') {
        income += t.amount;
      } else {
        expense += t.amount;
      }
    }
    return {
      totalIncome: income,
      totalExpense: expense,
      balance: income - expense,
    };
  }, [transactions]);

  const formatCurrency = (val: number) => {
    const num = Math.abs(val).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${currency} ${num}`;
  };

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      {/* Net Balance Section */}
      <View style={styles.balanceSection}>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.balanceLabel}>
          TOTAL BALANCE
        </ThemedText>
        <ThemedText style={styles.balanceAmount}>
          {balance < 0 ? `-${formatCurrency(balance)}` : formatCurrency(balance)}
        </ThemedText>
      </View>

      {/* Income & Expense Row */}
      <View style={styles.flowRow}>
        {/* Income Block */}
        <View style={styles.flowBlock}>
          <View style={styles.iconCircleIncome}>
            <ThemedText style={styles.arrowIcon}>↓</ThemedText>
          </View>
          <View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.flowLabel}>
              Income
            </ThemedText>
            <ThemedText style={styles.incomeAmount}>
              +{formatCurrency(totalIncome)}
            </ThemedText>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Expense Block */}
        <View style={styles.flowBlock}>
          <View style={styles.iconCircleExpense}>
            <ThemedText style={styles.arrowIcon}>↑</ThemedText>
          </View>
          <View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.flowLabel}>
              Expenses
            </ThemedText>
            <ThemedText style={styles.expenseAmount}>
              -{formatCurrency(totalExpense)}
            </ThemedText>
          </View>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.four,
    borderRadius: Spacing.four,
    gap: Spacing.three,
  },
  balanceSection: {
    gap: 4,
  },
  balanceLabel: {
    fontSize: 11,
    letterSpacing: 0.8,
  },
  balanceAmount: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  flowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(150, 150, 150, 0.2)',
  },
  flowBlock: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 32,
    backgroundColor: 'rgba(150, 150, 150, 0.2)',
    marginHorizontal: Spacing.two,
  },
  iconCircleIncome: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleExpense: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowIcon: {
    fontSize: 14,
    fontWeight: '700',
  },
  flowLabel: {
    fontSize: 11,
  },
  incomeAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#10b981',
  },
  expenseAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ef4444',
  },
});
