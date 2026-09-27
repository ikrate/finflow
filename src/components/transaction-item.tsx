import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Transaction } from '@/types/finance';
import { CATEGORY_MAP } from '@/utils/categories';

interface TransactionItemProps {
  transaction: Transaction;
  currency?: string;
  onDelete: (id: string) => void;
  onEdit?: (transaction: Transaction) => void;
}

const DELETE_BTN_WIDTH = 76;

export function TransactionItem({ transaction, currency = '$', onDelete, onEdit }: TransactionItemProps) {
  const theme = useTheme();
  const meta = CATEGORY_MAP[transaction.category as import('@/types/finance').Category] ?? CATEGORY_MAP.Other;
  const isIncome = transaction.type === 'income';

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    if (isToday) return 'Today';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const renderRightActions = () => {
    return (
      <View style={styles.deleteBackground}>
        {/* Background extension to prevent hard cuts on rounded corners */}
        <View style={{ position: 'absolute', top: 0, bottom: 0, left: -500, right: 0, backgroundColor: '#ef4444' }} />
        <Pressable
          onPress={() => onDelete(transaction.id)}
          style={({ pressed }) => [
            styles.actionBtn,
            pressed && styles.actionBtnPressed,
          ]}>
          <Ionicons name="trash-outline" size={20} color="#ffffff" style={styles.actionIcon} />
          <ThemedText style={styles.actionText}>Delete</ThemedText>
        </Pressable>
      </View>
    );
  };

  const renderLeftActions = () => {
    if (!onEdit) return null;
    return (
      <View style={styles.editBackground}>
        {/* Background extension to prevent hard cuts on rounded corners */}
        <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: -500, backgroundColor: '#3b82f6' }} />
        <Pressable
          onPress={() => onEdit(transaction)}
          style={({ pressed }) => [
            styles.actionBtn,
            pressed && styles.actionBtnPressed,
          ]}>
          <Ionicons name="pencil-outline" size={20} color="#ffffff" style={styles.actionIcon} />
          <ThemedText style={styles.actionText}>Edit</ThemedText>
        </Pressable>
      </View>
    );
  };

  return (
    <View style={styles.wrapper}>
      <Swipeable 
        renderRightActions={renderRightActions} 
        renderLeftActions={onEdit ? renderLeftActions : undefined}
        overshootRight={false} 
        overshootLeft={false}
        friction={2}
        overshootFriction={8}
        animationOptions={{ bounciness: 0 }}
        containerStyle={{ overflow: 'hidden', borderRadius: Spacing.four }}
      >
        <ThemedView type="backgroundElement" style={styles.cardContent}>
          {/* Category Icon */}
          <View style={[styles.iconContainer, { backgroundColor: meta.bg }]}>
            <ThemedText style={styles.categoryIcon}>{meta.icon}</ThemedText>
          </View>

          {/* Title & Metadata */}
          <View style={styles.details}>
            <ThemedText numberOfLines={1} style={styles.title}>
              {transaction.title}
            </ThemedText>
            <View style={styles.subRow}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.categoryLabel}>
                {meta.label}
              </ThemedText>
              {transaction.source ? (
                <ThemedText type="code" themeColor="textSecondary" style={styles.dateLabel}>
                  • {transaction.source}
                </ThemedText>
              ) : null}
              <ThemedText type="code" themeColor="textSecondary" style={styles.dateLabel}>
                • {formatDate(transaction.date)}
              </ThemedText>
            </View>
          </View>

          {/* Amount */}
          <View style={styles.rightSection}>
            <ThemedText
              style={[styles.amountText, isIncome ? styles.incomeText : styles.expenseText]}>
              {isIncome ? '+' : '-'}{currency} {transaction.amount.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </ThemedText>
          </View>
        </ThemedView>
      </Swipeable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: Spacing.one,
    borderRadius: Spacing.four,
    backgroundColor: 'transparent', // removed blue fallback to prevent color leaking
  },
  deleteBackground: {
    width: DELETE_BTN_WIDTH,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editBackground: {
    width: DELETE_BTN_WIDTH,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtn: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  actionBtnPressed: {
    opacity: 0.8,
  },
  actionIcon: {
    marginTop: 2,
  },
  actionText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: Spacing.four,
    gap: Spacing.three,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryIcon: {
    fontSize: 20,
  },
  details: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  categoryLabel: {
    fontSize: 12,
  },
  dateLabel: {
    fontSize: 11,
  },
  rightSection: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  amountText: {
    fontSize: 15,
    fontWeight: '700',
  },
  incomeText: {
    color: '#10b981',
  },
  expenseText: {
    color: '#ef4444',
  },
});
