import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Category } from '@/types/finance';
import { ALL_CATEGORIES } from '@/utils/categories';
import { formatMoney } from '@/services/groups/utils';

interface EndEventModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (category: Category) => void;
  groupName: string;
  isHousehold: boolean;
  myShareMinor: number;
  currency: string;
}

export function EndEventModal({
  visible,
  onClose,
  onConfirm,
  groupName,
  isHousehold,
  myShareMinor,
  currency,
}: EndEventModalProps) {
  const theme = useTheme();
  const [selectedCategory, setSelectedCategory] = useState<Category>('Other');

  const handleConfirm = () => {
    onConfirm(selectedCategory);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <ThemedView type="backgroundElement" style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText style={styles.icon}>{isHousehold ? '🏠' : '🏁'}</ThemedText>

          <ThemedText type="smallBold" style={styles.title}>
            {isHousehold ? 'Post My Share' : 'End Event & Close Group'}
          </ThemedText>

          <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
            {isHousehold
              ? `Post your share of expenses since your last post to your personal transaction ledger.`
              : `Mark "${groupName}" as closed and record your personal share as a single ledger entry.`}
          </ThemedText>

          {/* Amount Badge */}
          <View style={styles.amountBox}>
            <ThemedText type="small" themeColor="textSecondary">
              Your Share of Expenses
            </ThemedText>
            <ThemedText style={styles.amountText}>
              {formatMoney(myShareMinor, currency)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11 }}>
              Settlements are transfers, not personal spending
            </ThemedText>
          </View>

          {/* Category Selector */}
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.categoryHeader}>
            CHOOSE PERSONAL CATEGORY
          </ThemedText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryList}>
            {ALL_CATEGORIES.map((cat) => {
              const isSelected = selectedCategory === cat;
              return (
                <Pressable
                  key={cat}
                  onPress={() => setSelectedCategory(cat)}
                  style={[
                    styles.catChip,
                    isSelected && styles.catChipSelected,
                    { backgroundColor: isSelected ? '#3b82f6' : theme.background },
                  ]}>
                  <ThemedText style={[styles.catText, isSelected && styles.catTextSelected]}>
                    {cat}
                  </ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Actions */}
          <View style={styles.btnRow}>
            <Pressable onPress={onClose} style={[styles.cancelBtn, { borderColor: 'rgba(150,150,150,0.3)' }]}>
              <ThemedText style={styles.cancelBtnText}>Cancel</ThemedText>
            </Pressable>
            <Pressable onPress={handleConfirm} style={styles.confirmBtn}>
              <ThemedText style={styles.confirmBtnText}>
                {isHousehold ? 'Post Entry' : 'End & Post'}
              </ThemedText>
            </Pressable>
          </View>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.two,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  icon: {
    fontSize: 34,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: Spacing.two,
  },
  amountBox: {
    width: '100%',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 12,
    padding: Spacing.three,
    alignItems: 'center',
    gap: 4,
    marginVertical: Spacing.one,
  },
  amountText: {
    fontSize: 26,
    fontWeight: '800',
    color: '#3b82f6',
  },
  categoryHeader: {
    alignSelf: 'flex-start',
    fontSize: 12,
    letterSpacing: 0.5,
    marginTop: Spacing.one,
  },
  categoryList: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(150, 150, 150, 0.25)',
  },
  catChipSelected: {
    borderColor: 'transparent',
  },
  catText: {
    fontSize: 13,
    fontWeight: '500',
  },
  catTextSelected: {
    color: '#ffffff',
    fontWeight: '700',
  },
  btnRow: {
    flexDirection: 'row',
    width: '100%',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  cancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontWeight: '600',
  },
  confirmBtn: {
    flex: 1,
    height: 44,
    backgroundColor: '#3b82f6',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmBtnText: {
    color: '#ffffff',
    fontWeight: '700',
  },
});
