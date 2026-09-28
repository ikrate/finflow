import React, { useCallback, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { loadAppSettings, saveAppSettings } from '@/services/storage';
import { AppSettings, Category, DEFAULT_APP_SETTINGS } from '@/types/finance';
import { ALL_CATEGORIES, CATEGORY_MAP } from '@/utils/categories';

export default function VendorCategoriesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useTheme();

  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddingVendor, setIsAddingVendor] = useState(false);
  const [newVendorName, setNewVendorName] = useState('');
  const [newVendorCategory, setNewVendorCategory] = useState<Category>('Food');
  const [editingVendorName, setEditingVendorName] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const loaded = await loadAppSettings();
    setSettings(loaded);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const vendorEntries = useMemo(() => {
    const entries = Object.entries(settings.vendorCategories || {});
    return entries.sort((a, b) => a[0].localeCompare(b[0]));
  }, [settings.vendorCategories]);

  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return vendorEntries;
    const query = searchQuery.trim().toLowerCase();
    return vendorEntries.filter(([vendor]) => vendor.toLowerCase().includes(query));
  }, [vendorEntries, searchQuery]);

  const handleUpdateVendorCategory = async (vendor: string, category: Category) => {
    const updated: AppSettings = {
      ...settings,
      vendorCategories: {
        ...(settings.vendorCategories || {}),
        [vendor]: category,
      },
    };
    await saveAppSettings(updated);
    setSettings(updated);
    setEditingVendorName(null);
  };

  const handleDeleteVendorRule = async (vendor: string) => {
    const copy = { ...(settings.vendorCategories || {}) };
    delete copy[vendor];
    const updated: AppSettings = {
      ...settings,
      vendorCategories: copy,
    };
    await saveAppSettings(updated);
    setSettings(updated);
  };

  const handleAddVendorRule = async () => {
    const trimmed = newVendorName.trim();
    if (!trimmed) return;
    const updated: AppSettings = {
      ...settings,
      vendorCategories: {
        ...(settings.vendorCategories || {}),
        [trimmed]: newVendorCategory,
      },
    };
    await saveAppSettings(updated);
    setSettings(updated);
    setNewVendorName('');
    setIsAddingVendor(false);
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
              <ThemedText style={styles.backText}>Settings</ThemedText>
            </Pressable>

            <ThemedText style={styles.navBarTitle} numberOfLines={1}>
              Vendor Categories
            </ThemedText>

            <Pressable
              hitSlop={10}
              onPress={() => setIsAddingVendor((prev) => !prev)}
              style={({ pressed }) => [styles.navBarRightBtn, pressed && styles.btnPressed]}>
              <ThemedText style={styles.navBarRightText}>
                {isAddingVendor ? 'Cancel' : '+ Add'}
              </ThemedText>
            </Pressable>
          </View>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, Spacing.four) + 36 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={styles.pageHeader}>
            <ThemedText type="title" style={styles.pageTitle}>
              Vendor Categories
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.pageSubtitle}>
              Default categories for merchants. New transactions matching these vendors will automatically use these rules.
            </ThemedText>
          </View>

          {/* Add Vendor Form (Expandable) */}
          {isAddingVendor && (
            <ThemedView type="backgroundElement" style={styles.card}>
              <View style={styles.cardHeader}>
                <ThemedText style={styles.cardIcon}>✨</ThemedText>
                <ThemedText type="smallBold">NEW VENDOR RULE</ThemedText>
              </View>

              <TextInput
                value={newVendorName}
                onChangeText={setNewVendorName}
                placeholder="Vendor Name (e.g. Uber, Starbucks, Keells)"
                placeholderTextColor={theme.textSecondary}
                style={[
                  styles.vendorInput,
                  {
                    color: theme.text,
                    backgroundColor: theme.background,
                    borderColor: 'rgba(150, 150, 150, 0.25)',
                  },
                ]}
                autoFocus
                autoCapitalize="words"
              />

              <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: 4 }}>
                Choose Default Category:
              </ThemedText>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoryScrollHorizontal}
                keyboardShouldPersistTaps="always">
                {ALL_CATEGORIES.map((cat) => {
                  const meta = CATEGORY_MAP[cat];
                  const isSelected = newVendorCategory === cat;
                  return (
                    <Pressable
                      key={cat}
                      onPress={() => setNewVendorCategory(cat)}
                      style={[
                        styles.categoryChip,
                        isSelected && {
                          backgroundColor: meta.color,
                          borderColor: meta.color,
                        },
                      ]}>
                      <ThemedText style={styles.chipIcon}>{meta.icon}</ThemedText>
                      <ThemedText
                        style={[
                          styles.chipLabel,
                          isSelected && { color: '#ffffff', fontWeight: '700' },
                        ]}>
                        {cat}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <View style={styles.formBtnRow}>
                <Pressable
                  onPress={() => {
                    setIsAddingVendor(false);
                    setNewVendorName('');
                  }}
                  style={styles.btnCancel}>
                  <ThemedText style={styles.btnCancelText}>Cancel</ThemedText>
                </Pressable>

                <Pressable
                  onPress={handleAddVendorRule}
                  disabled={!newVendorName.trim()}
                  style={[
                    styles.btnSave,
                    !newVendorName.trim() && { opacity: 0.5 },
                  ]}>
                  <ThemedText style={styles.btnSaveText}>Save Rule</ThemedText>
                </Pressable>
              </View>
            </ThemedView>
          )}

          {/* Search Bar (if more than 2 vendors) */}
          {vendorEntries.length > 2 && (
            <View
              style={[
                styles.searchContainer,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: 'rgba(150, 150, 150, 0.15)',
                },
              ]}>
              <ThemedText style={styles.searchIcon}>🔍</ThemedText>
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search vendor rules..."
                placeholderTextColor={theme.textSecondary}
                style={[styles.searchInput, { color: theme.text }]}
                clearButtonMode="while-editing"
              />
              {searchQuery.length > 0 && (
                <Pressable hitSlop={8} onPress={() => setSearchQuery('')}>
                  <ThemedText style={styles.searchClearIcon}>✕</ThemedText>
                </Pressable>
              )}
            </View>
          )}

          {/* Rules List */}
          <ThemedView type="backgroundElement" style={styles.card}>
            <View style={styles.cardHeaderBetween}>
              <View style={styles.cardHeader}>
                <ThemedText style={styles.cardIcon}>🏷️</ThemedText>
                <ThemedText type="smallBold">
                  CONFIGURED RULES ({filteredEntries.length}
                  {searchQuery.trim() ? ` / ${vendorEntries.length}` : ''})
                </ThemedText>
              </View>

              {!isAddingVendor && (
                <Pressable
                  onPress={() => setIsAddingVendor(true)}
                  style={({ pressed }) => [styles.btnAddInline, pressed && styles.btnPressed]}>
                  <ThemedText style={styles.btnAddInlineText}>+ Add Rule</ThemedText>
                </Pressable>
              )}
            </View>

            {vendorEntries.length === 0 ? (
              <View style={styles.emptyContainer}>
                <ThemedText style={styles.emptyIcon}>🏷️</ThemedText>
                <ThemedText type="smallBold" style={styles.emptyTitle}>
                  No Vendor Rules Yet
                </ThemedText>
                <ThemedText
                  type="small"
                  themeColor="textSecondary"
                  style={styles.emptyDesc}>
                  When you record transactions with new vendors, FinFlow remembers their default category. You can also tap &quot;+ Add&quot; above to add specific merchant rules.
                </ThemedText>
              </View>
            ) : filteredEntries.length === 0 ? (
              <View style={styles.emptyContainer}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.emptyDesc}>
                  No vendor rules match &quot;{searchQuery}&quot;.
                </ThemedText>
              </View>
            ) : (
              <View style={styles.vendorList}>
                {filteredEntries.map(([vendor, cat]) => {
                  const meta = CATEGORY_MAP[cat] || CATEGORY_MAP.Other;
                  const isEditing = editingVendorName === vendor;

                  return (
                    <View
                      key={vendor}
                      style={[
                        styles.vendorItem,
                        { borderBottomColor: 'rgba(150, 150, 150, 0.12)' },
                      ]}>
                      <View style={styles.vendorItemMain}>
                        <View style={styles.vendorTextGroup}>
                          <ThemedText
                            type="default"
                            numberOfLines={1}
                            style={styles.vendorName}>
                            {vendor}
                          </ThemedText>
                        </View>

                        <View style={styles.vendorActions}>
                          <Pressable
                            hitSlop={6}
                            onPress={() =>
                              setEditingVendorName(isEditing ? null : vendor)
                            }
                            style={[
                              styles.vendorBadge,
                              { backgroundColor: meta.bg, borderColor: meta.color },
                            ]}>
                            <ThemedText style={styles.vendorBadgeIcon}>
                              {meta.icon}
                            </ThemedText>
                            <ThemedText
                              style={[styles.vendorBadgeText, { color: meta.color }]}>
                              {cat} ▾
                            </ThemedText>
                          </Pressable>

                          <Pressable
                            hitSlop={10}
                            onPress={() => handleDeleteVendorRule(vendor)}
                            style={styles.vendorDeleteBtn}>
                            <ThemedText style={styles.vendorDeleteIcon}>✕</ThemedText>
                          </Pressable>
                        </View>
                      </View>

                      {/* Inline Category Change Options */}
                      {isEditing && (
                        <View style={styles.editCategoryRow}>
                          <ThemedText
                            type="small"
                            themeColor="textSecondary"
                            style={{ fontSize: 12 }}>
                            Change default category for {vendor}:
                          </ThemedText>
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.categoryScrollHorizontal}
                            keyboardShouldPersistTaps="always">
                            {ALL_CATEGORIES.map((c) => {
                              const cMeta = CATEGORY_MAP[c];
                              const isSel = cat === c;
                              return (
                                <Pressable
                                  key={c}
                                  onPress={() => handleUpdateVendorCategory(vendor, c)}
                                  style={[
                                    styles.categoryChipSmall,
                                    isSel && {
                                      backgroundColor: cMeta.color,
                                      borderColor: cMeta.color,
                                    },
                                  ]}>
                                  <ThemedText style={styles.chipIconSmall}>
                                    {cMeta.icon}
                                  </ThemedText>
                                  <ThemedText
                                    style={[
                                      styles.chipLabelSmall,
                                      isSel && {
                                        color: '#ffffff',
                                        fontWeight: '700',
                                      },
                                    ]}>
                                    {c}
                                  </ThemedText>
                                </Pressable>
                              );
                            })}
                          </ScrollView>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </ThemedView>

          {/* Helpful Tip Footer */}
          <View style={styles.tipBox}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.tipText}>
              💡 <ThemedText style={{ fontWeight: '700' }}>Tip:</ThemedText> You can edit any individual transaction anytime without changing these default rules.
            </ThemedText>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
    minWidth: 70,
  },
  btnPressed: {
    opacity: 0.6,
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
    minWidth: 70,
    alignItems: 'flex-end',
  },
  navBarRightText: {
    fontSize: 15,
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
  pageHeader: {
    paddingVertical: Spacing.one,
    gap: 4,
  },
  pageTitle: {
    fontSize: 26,
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
  cardHeaderBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardIcon: {
    fontSize: 16,
  },
  btnAddInline: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
  },
  btnAddInlineText: {
    color: '#3b82f6',
    fontSize: 12,
    fontWeight: '700',
  },
  vendorInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  categoryScrollHorizontal: {
    gap: 8,
    paddingVertical: 6,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: 'rgba(150, 150, 150, 0.12)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipIcon: {
    fontSize: 14,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  categoryChipSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: 'rgba(150, 150, 150, 0.12)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipIconSmall: {
    fontSize: 12,
  },
  chipLabelSmall: {
    fontSize: 11,
    fontWeight: '600',
  },
  formBtnRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: 4,
  },
  btnCancel: {
    flex: 1,
    backgroundColor: 'rgba(150, 150, 150, 0.15)',
    paddingVertical: 10,
    borderRadius: Spacing.two,
    alignItems: 'center',
  },
  btnCancelText: {
    fontWeight: '600',
    fontSize: 14,
  },
  btnSave: {
    flex: 1,
    backgroundColor: '#3b82f6',
    paddingVertical: 10,
    borderRadius: Spacing.two,
    alignItems: 'center',
  },
  btnSaveText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Spacing.two,
    borderWidth: 1,
    gap: 8,
  },
  searchIcon: {
    fontSize: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
  searchClearIcon: {
    fontSize: 12,
    color: '#94a3b8',
    padding: 4,
  },
  emptyContainer: {
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    gap: Spacing.one,
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 15,
  },
  emptyDesc: {
    textAlign: 'center',
    lineHeight: 19,
    fontSize: 13,
  },
  vendorList: {
    gap: Spacing.one,
  },
  vendorItem: {
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.one,
  },
  vendorItemMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  vendorTextGroup: {
    flex: 1,
  },
  vendorName: {
    fontSize: 15,
    fontWeight: '700',
  },
  vendorActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  vendorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  vendorBadgeIcon: {
    fontSize: 13,
  },
  vendorBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  vendorDeleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  vendorDeleteIcon: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '700',
  },
  editCategoryRow: {
    paddingTop: Spacing.one,
    gap: 4,
  },
  tipBox: {
    alignItems: 'center',
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
  },
  tipText: {
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 18,
  },
});
