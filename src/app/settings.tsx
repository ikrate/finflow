import React, { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useFocusEffect, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { loadAppSettings, saveAppSettings, clearAllTransactions } from '@/services/storage';
import { DEFAULT_APP_SETTINGS, CURRENCIES } from '@/types/finance';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [settings, setSettings] = useState(DEFAULT_APP_SETTINGS);
  const theme = useTheme();

  const [confirmClearVisible, setConfirmClearVisible] = useState(false);

  const loadData = useCallback(async () => {
    const loaded = await loadAppSettings();
    setSettings(loaded);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const vendorEntries = useMemo(() => {
    return Object.entries(settings.vendorCategories || {}).sort((a, b) =>
      a[0].localeCompare(b[0])
    );
  }, [settings.vendorCategories]);

  const handleSelectCurrency = async (curr: string) => {
    const updated = { ...settings, currency: curr };
    await saveAppSettings(updated);
    setSettings(updated);
  };

  const handleToggleHaptics = async (enabled: boolean) => {
    const updated = { ...settings, enableHaptics: enabled };
    await saveAppSettings(updated);
    setSettings(updated);
  };

  const executeClear = async () => {
    setConfirmClearVisible(false);
    await clearAllTransactions();
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
              Settings
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
              App Settings
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.pageSubtitle}>
              Preferences, currency and data management
            </ThemedText>
          </View>
            {/* Currency Selector */}
            <ThemedView type="backgroundElement" style={styles.card}>
              <View style={styles.cardHeader}>
                <ThemedText style={styles.cardIcon}>💰</ThemedText>
                <ThemedText type="smallBold">CURRENCY SYMBOL</ThemedText>
              </View>

              <View style={styles.currencyGrid}>
                {CURRENCIES.map((c) => {
                  const isSelected = settings.currency === c.symbol;
                  return (
                    <Pressable
                      key={c.symbol}
                      onPress={() => handleSelectCurrency(c.symbol)}
                      style={[
                        styles.currencyChip,
                        isSelected && styles.currencyChipActive,
                      ]}>
                      <ThemedText
                        style={[
                          styles.currencyChipText,
                          isSelected && styles.currencyChipTextActive,
                        ]}>
                        {c.label}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </ThemedView>

            {/* Haptics & Feedback */}
            <ThemedView type="backgroundElement" style={styles.card}>
              <View style={styles.switchRow}>
                <View style={styles.switchTextGroup}>
                  <ThemedText type="smallBold">Haptic Feedback</ThemedText>
                </View>
                <Switch
                  value={settings.enableHaptics}
                  onValueChange={handleToggleHaptics}
                  trackColor={{ false: '#64748b', true: '#3b82f6' }}
                  thumbColor="#ffffff"
                />
              </View>
            </ThemedView>

            {/* Vendor Categories Navigation Row */}
            <ThemedView type="backgroundElement" style={styles.card}>
              <Pressable
                onPress={() => router.push('/vendor-categories')}
                style={({ pressed }) => [styles.vendorNavRow, pressed && styles.btnPressed]}>
                <View style={styles.vendorNavLeft}>
                  <View style={styles.vendorNavIconContainer}>
                    <ThemedText style={styles.vendorNavIcon}>🏷️</ThemedText>
                  </View>
                  <View style={styles.vendorNavTextGroup}>
                    <ThemedText type="smallBold" style={styles.vendorNavTitle}>
                      Vendor Categories
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {vendorEntries.length === 0
                        ? 'Set default categories for merchants'
                        : `${vendorEntries.length} vendor rule${vendorEntries.length === 1 ? '' : 's'} configured`}
                    </ThemedText>
                  </View>
                </View>

                <View style={styles.vendorNavRight}>
                  {vendorEntries.length > 0 && (
                    <View style={styles.vendorNavBadge}>
                      <ThemedText style={styles.vendorNavBadgeText}>
                        {vendorEntries.length}
                      </ThemedText>
                    </View>
                  )}
                  <ThemedText style={styles.vendorNavChevron}>›</ThemedText>
                </View>
              </Pressable>
            </ThemedView>

            {/* Danger Zone: Clear Data */}
            <ThemedView type="backgroundElement" style={[styles.card, styles.dangerCard]}>
              <View style={styles.cardHeader}>
                <ThemedText style={styles.cardIcon}>🗑️</ThemedText>
                <ThemedText type="smallBold" style={{ color: '#ef4444' }}>
                  DATA MANAGEMENT
                </ThemedText>
              </View>

              {confirmClearVisible ? (
                <View style={styles.confirmBox}>
                  <ThemedText type="smallBold" style={{ color: '#ef4444' }}>
                    Are you sure? All transactions will be deleted.
                  </ThemedText>
                  <View style={styles.confirmBtnRow}>
                    <Pressable
                      onPress={() => setConfirmClearVisible(false)}
                      style={[styles.btnCancel]}>
                      <ThemedText style={styles.btnCancelText}>Cancel</ThemedText>
                    </Pressable>
                    <Pressable onPress={executeClear} style={[styles.btnConfirmDelete]}>
                      <ThemedText style={styles.btnConfirmDeleteText}>Yes, Delete</ThemedText>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  onPress={() => setConfirmClearVisible(true)}
                  style={({ pressed }) => [styles.btnClear, pressed && styles.btnPressed]}>
                  <ThemedText style={styles.btnClearText}>Clear All Transactions</ThemedText>
                </Pressable>
              )}
            </ThemedView>

            {/* App Info & Terms */}
            <View style={styles.infoFooter}>
              <Pressable
                hitSlop={8}
                onPress={() => router.push('/agreement')}
                style={({ pressed }) => [styles.termsLink, pressed && styles.termsLinkPressed]}>
                <ThemedText style={styles.termsLinkText}>
                  Read Terms and Conditions
                </ThemedText>
              </Pressable>
              <ThemedText type="small" themeColor="textSecondary" style={styles.footerInfoText}>
                FinFlow v1.0.0 • Local Storage • Offline First
              </ThemedText>
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
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  cardIcon: {
    fontSize: 16,
  },
  currencyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    paddingTop: Spacing.one,
  },
  currencyChip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: 8,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(150, 150, 150, 0.1)',
  },
  currencyChipActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.18)',
    borderColor: '#3b82f6',
    borderWidth: 1,
  },
  currencyChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  currencyChipTextActive: {
    color: '#3b82f6',
    fontWeight: '700',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  switchTextGroup: {
    flex: 1,
    gap: 4,
  },
  dangerCard: {
    borderColor: 'rgba(239, 68, 68, 0.25)',
    borderWidth: 1,
  },
  btnClear: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    paddingVertical: 10,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.one,
  },
  btnClearText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '700',
  },
  confirmBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    padding: Spacing.three,
    borderRadius: Spacing.two,
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  confirmBtnRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  btnCancel: {
    flex: 1,
    backgroundColor: 'rgba(150, 150, 150, 0.15)',
    paddingVertical: 8,
    borderRadius: Spacing.two,
    alignItems: 'center',
  },
  btnCancelText: {
    fontWeight: '600',
    fontSize: 13,
  },
  btnConfirmDelete: {
    flex: 1,
    backgroundColor: '#ef4444',
    paddingVertical: 8,
    borderRadius: Spacing.two,
    alignItems: 'center',
  },
  btnConfirmDeleteText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  infoFooter: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
    gap: 6,
  },
  termsLink: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  termsLinkPressed: {
    opacity: 0.6,
  },
  termsLinkText: {
    fontSize: 13,
    color: '#3b82f6',
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
  footerInfoText: {
    fontSize: 12,
  },
  btnPressed: {
    opacity: 0.8,
  },
  vendorNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  vendorNavLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flex: 1,
  },
  vendorNavIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vendorNavIcon: {
    fontSize: 18,
  },
  vendorNavTextGroup: {
    flex: 1,
    gap: 2,
  },
  vendorNavTitle: {
    fontSize: 15,
  },
  vendorNavRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  vendorNavBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  vendorNavBadgeText: {
    color: '#3b82f6',
    fontSize: 12,
    fontWeight: '700',
  },
  vendorNavChevron: {
    fontSize: 20,
    color: '#94a3b8',
    fontWeight: '300',
  },
});
