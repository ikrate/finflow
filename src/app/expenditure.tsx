import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  LayoutAnimation,
  Platform,
  UIManager,
  Animated,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Transaction } from '@/types/finance';
import { CATEGORY_MAP } from '@/utils/categories';
import { loadAppSettings, loadTransactions } from '@/services/storage';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Period = 'Daily' | 'Weekly' | 'Monthly' | 'Yearly' | 'Overall' | 'Custom';
const PERIODS: Period[] = ['Daily', 'Weekly', 'Monthly', 'Yearly', 'Overall', 'Custom'];

export default function ExpenditureScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const router = useRouter();

  const [selectedPeriod, setSelectedPeriod] = useState<Period>('Monthly');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [currency, setCurrency] = useState('$');

  // Animation values for content slide
  const [slideAnim] = useState(new Animated.Value(0));

  // Custom date selection state
  const [customStart, setCustomStart] = useState<Date>(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
  const [customEnd, setCustomEnd] = useState<Date>(new Date());
  
  // Modal state
  const [isCustomRangeModalOpen, setIsCustomRangeModalOpen] = useState(false);
  const [tempStart, setTempStart] = useState<Date>(customStart);
  const [tempEnd, setTempEnd] = useState<Date>(customEnd);
  const [showPicker, setShowPicker] = useState<'start' | 'end' | null>(null);

  const loadData = useCallback(async () => {
    const [txs, settings] = await Promise.all([loadTransactions(), loadAppSettings()]);
    setTransactions(txs);
    setCurrency(settings.currency);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleSelectPeriod = (period: Period) => {
    if (period === 'Custom') {
      setTempStart(customStart);
      setTempEnd(customEnd);
      setIsCustomRangeModalOpen(true);
      return;
    }

    if (period === selectedPeriod) return;
    
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    
    slideAnim.setValue(50);
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();

    setSelectedPeriod(period);
  };

  const applyCustomRange = () => {
    setCustomStart(tempStart);
    setCustomEnd(tempEnd);
    setIsCustomRangeModalOpen(false);
    
    if (selectedPeriod !== 'Custom') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      slideAnim.setValue(50);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
      setSelectedPeriod('Custom');
    }
  };

  const cancelCustomRange = () => {
    setIsCustomRangeModalOpen(false);
  };

  // Filter transactions for the selected period
  const filteredTransactions = useMemo(() => {
    const now = new Date();
    const start = new Date();

    if (selectedPeriod === 'Overall') {
      return transactions.filter(t => t.type === 'expense');
    }

    if (selectedPeriod === 'Daily') {
      start.setHours(0, 0, 0, 0);
    } else if (selectedPeriod === 'Weekly') {
      start.setDate(now.getDate() - 7);
      start.setHours(0, 0, 0, 0);
    } else if (selectedPeriod === 'Monthly') {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
    } else if (selectedPeriod === 'Yearly') {
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
    } else if (selectedPeriod === 'Custom') {
      start.setTime(customStart.getTime());
      start.setHours(0, 0, 0, 0);
      now.setTime(customEnd.getTime());
      now.setHours(23, 59, 59, 999);
    }

    return transactions.filter((t) => t.type === 'expense' && t.date >= start.getTime() && t.date <= now.getTime());
  }, [transactions, selectedPeriod, customStart, customEnd]);

  // Aggregate by category
  const { total, categoryTotals } = useMemo(() => {
    let totalExpense = 0;
    const catMap: Record<string, number> = {};

    filteredTransactions.forEach((t) => {
      totalExpense += t.amount;
      catMap[t.category] = (catMap[t.category] || 0) + t.amount;
    });

    const sortedCategories = Object.keys(catMap)
      .map((cat) => ({
        category: cat,
        amount: catMap[cat],
      }))
      .sort((a, b) => b.amount - a.amount);

    return { total: totalExpense, categoryTotals: sortedCategories };
  }, [filteredTransactions]);

  const maxCategoryAmount = categoryTotals.length > 0 ? categoryTotals[0].amount : 0;

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
              <ThemedText style={styles.backText}>Balances</ThemedText>
            </Pressable>

            <ThemedText style={styles.navBarTitle} numberOfLines={1}>
              Expenditure
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
          {/* Page Title Header */}
          <View style={styles.pageHeader}>
            <ThemedText type="title" style={styles.pageTitle}>
              Expenditure
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.pageSubtitle}>
              Analyze your spending habits
            </ThemedText>
          </View>

          {/* Period Selector (Horizontal Scroll) */}
          <View style={styles.segmentedControlContainer}>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false} 
              contentContainerStyle={styles.segmentedControl}
            >
              {PERIODS.map((p) => {
                const isActive = selectedPeriod === p;
                return (
                  <Pressable
                    key={p}
                    onPress={() => handleSelectPeriod(p)}
                    style={[styles.segmentBtn, isActive && styles.segmentBtnActive]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      {p === 'Custom' && (
                        <Ionicons 
                          name="calendar-outline" 
                          size={14} 
                          color={isActive ? '#ffffff' : '#64748b'} 
                        />
                      )}
                      <ThemedText
                        type="smallBold"
                        style={[styles.segmentText, isActive && styles.segmentTextActive]}>
                        {p}
                      </ThemedText>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Animated Content Wrapper */}
          <Animated.View style={{ 
            opacity: slideAnim.interpolate({
              inputRange: [0, 50],
              outputRange: [1, 0]
            }),
            transform: [{ translateX: slideAnim }] 
          }}>
            
            {/* Total Overview Card */}
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                TOTAL SPENT
              </ThemedText>
              <ThemedText type="title" style={styles.totalAmount}>
                {currency}{total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </ThemedText>
            </ThemedView>

            {/* Category Breakdown */}
            <View style={styles.breakdownContainer}>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.breakdownHeader}>
                BY CATEGORY
              </ThemedText>

              {categoryTotals.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
                  No expenses in this period.
                </ThemedText>
              ) : (
                <View style={styles.barChart}>
                  {categoryTotals.map((item) => {
                    const meta = CATEGORY_MAP[item.category as keyof typeof CATEGORY_MAP] || CATEGORY_MAP.Other;
                    const percentage = total > 0 ? (item.amount / total) * 100 : 0;
                    const barWidth = maxCategoryAmount > 0 ? (item.amount / maxCategoryAmount) * 100 : 0;

                    return (
                      <View key={item.category} style={styles.barItem}>
                        <View style={styles.barHeader}>
                          <View style={styles.barLabelGroup}>
                            <ThemedText type="smallBold">{meta.label.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim()}</ThemedText>
                          </View>
                          <ThemedText type="smallBold">
                            {currency}{item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </ThemedText>
                        </View>
                        
                        <View style={styles.barTrack}>
                          <View style={[styles.barFill, { width: `${barWidth}%`, backgroundColor: meta.bg || '#3b82f6' }]} />
                        </View>
                        <ThemedText type="code" themeColor="textSecondary" style={styles.barSubtext}>
                          {percentage.toFixed(1)}% of total
                        </ThemedText>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </Animated.View>
        </ScrollView>
      </View>

      {/* Custom Range Modal */}
      <Modal visible={isCustomRangeModalOpen} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <ThemedView type="backgroundElement" style={styles.modalContent}>
            <ThemedText type="title" style={{ fontSize: 20 }}>Select Custom Range</ThemedText>
            
            <View style={styles.customDateContainer}>
              {Platform.OS === 'ios' ? (
                <View style={styles.datePickerRowIOS}>
                  <View style={styles.datePickerItem}>
                    <ThemedText type="smallBold" themeColor="textSecondary">FROM</ThemedText>
                    <DateTimePicker
                      value={tempStart}
                      mode="date"
                      display="default"
                      onChange={(_, date) => date && setTempStart(date)}
                    />
                  </View>
                  <View style={styles.datePickerItem}>
                    <ThemedText type="smallBold" themeColor="textSecondary">TO</ThemedText>
                    <DateTimePicker
                      value={tempEnd}
                      mode="date"
                      display="default"
                      onChange={(_, date) => date && setTempEnd(date)}
                    />
                  </View>
                </View>
              ) : (
                <View style={styles.datePickerRowAndroid}>
                  <View style={styles.datePickerItem}>
                    <ThemedText type="smallBold" themeColor="textSecondary">FROM</ThemedText>
                    <Pressable 
                      onPress={() => setShowPicker('start')}
                      style={({pressed}) => [styles.dateBtnAndroid, pressed && styles.pressed]}>
                      <ThemedText>{tempStart.toLocaleDateString()}</ThemedText>
                    </Pressable>
                  </View>
                  <View style={styles.datePickerItem}>
                    <ThemedText type="smallBold" themeColor="textSecondary">TO</ThemedText>
                    <Pressable 
                      onPress={() => setShowPicker('end')}
                      style={({pressed}) => [styles.dateBtnAndroid, pressed && styles.pressed]}>
                      <ThemedText>{tempEnd.toLocaleDateString()}</ThemedText>
                    </Pressable>
                  </View>

                  {showPicker && (
                    <DateTimePicker
                      value={showPicker === 'start' ? tempStart : tempEnd}
                      mode="date"
                      onChange={(_, date) => {
                        setShowPicker(null);
                        if (date) {
                          if (showPicker === 'start') setTempStart(date);
                          else setTempEnd(date);
                        }
                      }}
                    />
                  )}
                </View>
              )}
            </View>
            
            <View style={styles.modalBtnRow}>
              <Pressable onPress={cancelCustomRange} style={styles.btnCancel}>
                <ThemedText style={styles.btnCancelText}>Cancel</ThemedText>
              </Pressable>
              <Pressable onPress={applyCustomRange} style={styles.btnApply}>
                <ThemedText style={styles.btnApplyText}>Apply</ThemedText>
              </Pressable>
            </View>
          </ThemedView>
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
  pageHeader: {
    paddingVertical: Spacing.one,
    gap: 4,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    fontSize: 14,
    lineHeight: 19,
  },
  segmentedControlContainer: {
    marginHorizontal: -Spacing.four, 
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: 'rgba(150, 150, 150, 0.1)',
    borderRadius: Spacing.two,
    padding: 4,
    marginHorizontal: Spacing.four,
    gap: 4,
  },
  segmentBtn: {
    paddingHorizontal: Spacing.three,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: Spacing.two - 2,
  },
  segmentBtnActive: {
    backgroundColor: '#3b82f6',
  },
  segmentText: {
    fontSize: 13,
    color: '#64748b',
  },
  segmentTextActive: {
    color: '#ffffff',
  },
  card: {
    padding: Spacing.four,
    borderRadius: Spacing.three,
    gap: Spacing.one,
    alignItems: 'center',
  },
  totalAmount: {
    fontSize: 32,
    fontWeight: '800',
    color: '#3b82f6',
  },
  breakdownContainer: {
    marginTop: Spacing.two,
    gap: Spacing.three,
  },
  breakdownHeader: {
    paddingHorizontal: Spacing.one,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: Spacing.four,
  },
  barChart: {
    gap: Spacing.four,
    paddingHorizontal: Spacing.one,
  },
  barItem: {
    gap: Spacing.one,
  },
  barHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  barLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  barTrack: {
    height: 12,
    backgroundColor: 'rgba(150, 150, 150, 0.15)',
    borderRadius: 6,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 6,
  },
  barSubtext: {
    fontSize: 11,
    textAlign: 'right',
  },
  customDateContainer: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    marginBottom: Spacing.two,
  },
  datePickerRowIOS: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  datePickerRowAndroid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  datePickerItem: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  dateBtnAndroid: {
    paddingHorizontal: Spacing.three,
    paddingVertical: 10,
    backgroundColor: 'rgba(150, 150, 150, 0.1)',
    borderRadius: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  modalContent: {
    padding: Spacing.four,
    borderRadius: Spacing.three,
    gap: Spacing.three,
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
