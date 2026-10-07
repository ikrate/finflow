import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BarcodeScannerModal } from '@/components/barcode-scanner-modal';
import { PasteInviteModal } from '@/components/paste-invite-modal';
import { ProfileNameModal } from '@/components/profile-name-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { calculateBalances } from '@/services/groups/balances';
import { deriveGroupState } from '@/services/groups/eventLog';
import {
  getOrCreateDeviceId,
  loadGroupEvents,
  loadGroupsIndex,
  updateProfileNameAcrossGroups,
} from '@/services/groups/storage';
import { GroupMeta, GroupType } from '@/services/groups/types';
import { formatMoney } from '@/services/groups/utils';
import { loadAppSettings } from '@/services/storage';

interface GroupCardData {
  meta: GroupMeta;
  myNetBalance: number;
  memberCount: number;
  expenseCount: number;
}

const TYPE_ICONS: Record<GroupType, string> = {
  trip: '✈️',
  event: '🎉',
  household: '🏠',
  other: '👥',
};

export default function GroupsListScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useTheme();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [groups, setGroups] = useState<GroupCardData[]>([]);
  const [isNameModalVisible, setIsNameModalVisible] = useState(false);

  // Invite entry modals
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [settings, index] = await Promise.all([
        loadAppSettings(),
        loadGroupsIndex(),
      ]);

      if (!settings.profileName || !settings.profileName.trim()) {
        setIsNameModalVisible(true);
      } else {
        await getOrCreateDeviceId();
      }

      // Load derived state for each group
      const cards: GroupCardData[] = [];
      for (const meta of index) {
        const events = await loadGroupEvents(meta.id);
        const state = deriveGroupState(meta.id, events);

        let myNet = 0;
        if (meta.myMemberId) {
          const balances = calculateBalances(state.expenses, state.settlements, state.members);
          myNet = balances[meta.myMemberId]?.netBalance || 0;
        }

        cards.push({
          meta: {
            ...meta,
            name: state.name || meta.name,
            status: state.status || meta.status,
          },
          myNetBalance: myNet,
          memberCount: state.members.length,
          expenseCount: state.expenses.length,
        });
      }

      // Sort open groups first, then recently created
      cards.sort((a, b) => {
        if (a.meta.status !== b.meta.status) {
          return a.meta.status === 'open' ? -1 : 1;
        }
        return b.meta.createdAt - a.meta.createdAt;
      });

      setGroups(cards);
    } catch (err) {
      console.warn('Failed to load groups list', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleSaveProfileName = async (name: string) => {
    setIsNameModalVisible(false);
    await updateProfileNameAcrossGroups(name);
    loadData();
  };

  const handleOpenInviteLink = (link: string) => {
    setIsScannerOpen(false);
    setIsPasteModalOpen(false);

    let dParam = link;
    if (link.includes('?d=')) {
      const qIdx = link.indexOf('?d=');
      dParam = link.slice(qIdx + 3);
    } else if (link.startsWith('finflow://join')) {
      const qIdx = link.indexOf('?');
      if (qIdx !== -1) {
        const sp = new URLSearchParams(link.slice(qIdx + 1));
        dParam = sp.get('d') || link;
      }
    }

    router.push({
      pathname: '/join',
      params: { d: dParam },
    });
  };

  const formatLastSync = (lastSyncedAt?: Record<string, number>, needsFirstSync?: boolean) => {
    if (needsFirstSync) return '⚠️ Needs first sync';
    if (!lastSyncedAt) return 'Never synced';
    const timestamps = Object.values(lastSyncedAt);
    if (timestamps.length === 0) return 'Never synced';
    const latest = Math.max(...timestamps);
    const diffMins = Math.floor((Date.now() - latest) / 60000);
    if (diffMins < 1) return 'Synced just now';
    if (diffMins < 60) return `Synced ${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Synced ${diffHours}h ago`;
    return `Synced ${Math.floor(diffHours / 24)}d ago`;
  };

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
            <ThemedText style={styles.backText}>Back</ThemedText>
          </Pressable>

          <ThemedText style={styles.navBarTitle} numberOfLines={1}>
            Groups
          </ThemedText>

          <View style={styles.navBarRightPlaceholder} />
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, Spacing.four) + 40 },
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
        {/* Header with Title and Action Buttons */}
        <View style={styles.pageHeader}>
          <View>
            <ThemedText type="title" style={styles.pageTitle}>
              Group Expenses
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.pageSubtitle}>
              Offline, private expense sharing with nearby sync
            </ThemedText>
          </View>

          {/* Three Action Buttons: New group, Scan invite, Paste link */}
          <View style={styles.topBtnRow}>
            <Pressable
              onPress={() => router.push('/groups/new')}
              style={({ pressed }) => [styles.topActionBtn, styles.primaryBtn, pressed && styles.btnPressed]}>
              <ThemedText style={styles.primaryBtnText}>+ New Group</ThemedText>
            </Pressable>

            <Pressable
              onPress={() => setIsScannerOpen(true)}
              style={({ pressed }) => [styles.topActionBtn, styles.secondaryBtn, pressed && styles.btnPressed]}>
              <ThemedText style={styles.secondaryBtnText}>📷 Scan Invite</ThemedText>
            </Pressable>

            <Pressable
              onPress={() => setIsPasteModalOpen(true)}
              style={({ pressed }) => [styles.topActionBtn, styles.secondaryBtn, pressed && styles.btnPressed]}>
              <ThemedText style={styles.secondaryBtnText}>📋 Paste Link</ThemedText>
            </Pressable>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#3b82f6" />
          </View>
        ) : groups.length === 0 ? (
          <ThemedView type="backgroundElement" style={styles.emptyCard}>
            <ThemedText style={styles.emptyIcon}>👥</ThemedText>
            <ThemedText style={styles.emptyTitle}>No Groups Yet</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.emptySubtitle}>
              Create a group for a trip, roommate household bills, or event. Share and sync balances directly with people nearby without servers.
            </ThemedText>
            <Pressable
              onPress={() => router.push('/groups/new')}
              style={({ pressed }) => [styles.createFirstBtn, pressed && styles.btnPressed]}>
              <ThemedText style={styles.createFirstBtnText}>Create Your First Group</ThemedText>
            </Pressable>
          </ThemedView>
        ) : (
          <View style={styles.groupList}>
            {groups.map(({ meta, myNetBalance, memberCount, expenseCount }) => {
              const isClosed = meta.status === 'closed';
              const isOwed = myNetBalance > 0;
              const owes = myNetBalance < 0;

              return (
                <ThemedView key={meta.id} type="backgroundElement" style={styles.groupCard}>
                  <Pressable
                    onPress={() => router.push({ pathname: '/groups/[groupId]', params: { groupId: meta.id } })}
                    style={({ pressed }) => [styles.groupCardPressable, pressed && styles.btnPressed]}>
                    <View style={styles.groupCardHeader}>
                      <View style={styles.groupTypeBadge}>
                        <ThemedText style={styles.groupTypeIcon}>
                          {TYPE_ICONS[meta.type] || '👥'}
                        </ThemedText>
                      </View>

                      <View style={styles.groupMainInfo}>
                        <View style={styles.nameRow}>
                          <ThemedText style={styles.groupName} numberOfLines={1}>
                            {meta.name}
                          </ThemedText>
                          {isClosed && (
                            <View style={styles.closedBadge}>
                              <ThemedText style={styles.closedBadgeText}>Ended</ThemedText>
                            </View>
                          )}
                        </View>
                        <ThemedText type="small" themeColor="textSecondary">
                          {memberCount} member{memberCount === 1 ? '' : 's'} • {expenseCount} expense{expenseCount === 1 ? '' : 's'}
                        </ThemedText>
                      </View>

                      <ThemedText style={styles.chevron}>›</ThemedText>
                    </View>

                    <View style={styles.cardDivider} />

                    <View style={styles.groupCardFooter}>
                      <View>
                        <ThemedText type="small" themeColor="textSecondary" style={styles.balanceLabel}>
                          {isOwed ? 'You are owed' : owes ? 'You owe' : 'Settled up'}
                        </ThemedText>
                        <ThemedText
                          style={[
                            styles.balanceAmount,
                            isOwed && styles.balanceGreen,
                            owes && styles.balanceRed,
                          ]}>
                          {formatMoney(myNetBalance, meta.currency)}
                        </ThemedText>
                      </View>

                      <ThemedText type="small" themeColor="textSecondary" style={styles.syncHint}>
                        {formatLastSync(meta.lastSyncedAt, meta.needsFirstSync)}
                      </ThemedText>
                    </View>
                  </Pressable>
                </ThemedView>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Barcode Scanner Modal */}
      <BarcodeScannerModal
        visible={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onLinkScanned={handleOpenInviteLink}
      />

      {/* Paste Invite Link Modal */}
      <PasteInviteModal
        visible={isPasteModalOpen}
        onClose={() => setIsPasteModalOpen(false)}
        onSubmitLink={handleOpenInviteLink}
      />

      {/* Onboarding Profile Name Modal */}
      <ProfileNameModal visible={isNameModalVisible} onSave={handleSaveProfileName} />
    </View>
  );
}

const styles = StyleSheet.create({
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
    gap: Spacing.four,
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.four,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  pageHeader: {
    gap: Spacing.three,
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: '800',
  },
  pageSubtitle: {
    marginTop: 4,
  },
  topBtnRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  topActionBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  primaryBtn: {
    backgroundColor: '#3b82f6',
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  secondaryBtn: {
    backgroundColor: 'rgba(150, 150, 150, 0.15)',
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  btnPressed: {
    opacity: 0.8,
  },
  loadingBox: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyCard: {
    padding: Spacing.five,
    borderRadius: 18,
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  emptySubtitle: {
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
    marginBottom: Spacing.two,
  },
  createFirstBtn: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  createFirstBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  groupList: {
    gap: Spacing.three,
  },
  groupCard: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  groupCardPressable: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  groupCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  groupTypeBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupTypeIcon: {
    fontSize: 22,
  },
  groupMainInfo: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  groupName: {
    fontSize: 17,
    fontWeight: '700',
  },
  closedBadge: {
    backgroundColor: 'rgba(150, 150, 150, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  closedBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  chevron: {
    fontSize: 22,
    color: '#94a3b8',
    fontWeight: '300',
  },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(150, 150, 150, 0.2)',
  },
  groupCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  balanceLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  balanceAmount: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 2,
  },
  balanceGreen: {
    color: '#10b981',
  },
  balanceRed: {
    color: '#ef4444',
  },
  syncHint: {
    fontSize: 12,
  },
});
