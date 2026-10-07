import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProfileNameModal } from '@/components/profile-name-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { decodeInviteLink, InvitePayload } from '@/services/groups/invite';
import {
  getOrCreateDeviceId,
  loadGroupsIndex,
  updateProfileNameAcrossGroups,
  upsertGroupMeta,
} from '@/services/groups/storage';
import { GroupMeta, GroupType } from '@/services/groups/types';
import { loadAppSettings } from '@/services/storage';

const TYPE_ICONS: Record<GroupType, string> = {
  trip: '✈️',
  event: '🎉',
  household: '🏠',
  other: '👥',
};

const TYPE_LABELS: Record<GroupType, string> = {
  trip: 'Trip',
  event: 'Event',
  household: 'Household',
  other: 'Group',
};

export default function JoinGroupRoute() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useTheme();
  const params = useLocalSearchParams<{ d?: string }>();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<InvitePayload | null>(null);
  const [alreadyInGroup, setAlreadyInGroup] = useState<GroupMeta | null>(null);

  const [isNameModalVisible, setIsNameModalVisible] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  useEffect(() => {
    const resolvePayload = async () => {
      try {
        let rawD = params.d;

        // If not in params (e.g. cold start URL scheme race), read from Linking initial URL
        if (!rawD) {
          const initialUrl = await Linking.getInitialURL();
          if (initialUrl && initialUrl.includes('join')) {
            const qIdx = initialUrl.indexOf('?');
            if (qIdx !== -1) {
              const urlParams = new URLSearchParams(initialUrl.slice(qIdx + 1));
              rawD = urlParams.get('d') ?? undefined;
            }
          }
        }

        if (!rawD) {
          setError('No invite data provided. Please open or scan a valid FinFlow invite link.');
          setLoading(false);
          return;
        }

        const settings = await loadAppSettings();
        const decoded = decodeInviteLink(rawD, settings.currency || '$');
        setPayload(decoded);

        // Check if group already exists locally
        const localGroups = await loadGroupsIndex();
        const existing = localGroups.find((g) => g.id === decoded.groupId);
        if (existing) {
          setAlreadyInGroup(existing);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Invalid or corrupted invite link.');
      } finally {
        setLoading(false);
      }
    };

    resolvePayload();
  }, [params.d]);

  const handleJoinPress = async () => {
    if (!payload) return;

    // Verify user profile name exists before joining
    const settings = await loadAppSettings();
    if (!settings.profileName || !settings.profileName.trim()) {
      setIsNameModalVisible(true);
      return;
    }

    await performJoin();
  };

  const performJoin = async () => {
    if (!payload) return;
    setIsJoining(true);

    try {
      await getOrCreateDeviceId();

      const metaStub: GroupMeta = {
        id: payload.groupId,
        name: payload.name,
        type: payload.type,
        currency: payload.currency,
        createdAt: Date.now(),
        myMemberId: undefined,
        status: 'open',
        groupKey: payload.groupKey,
        needsFirstSync: true,
      };

      await upsertGroupMeta(metaStub);

      router.replace({
        pathname: '/groups/[groupId]',
        params: { groupId: payload.groupId },
      });
    } catch (err) {
      setError('Failed to save group stub. Please try again.');
      setIsJoining(false);
    }
  };

  const handleSaveProfileName = async (name: string) => {
    setIsNameModalVisible(false);
    await updateProfileNameAcrossGroups(name);
    await performJoin();
  };

  if (loading) {
    return (
      <View style={[styles.centerScreen, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: 12 }}>
          Verifying invite...
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Top Bar */}
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
            <ThemedText style={styles.backText}>Cancel</ThemedText>
          </Pressable>

          <ThemedText style={styles.navBarTitle} numberOfLines={1}>
            Group Invite
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
        showsVerticalScrollIndicator={false}>
        {/* Error View */}
        {error ? (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText style={styles.errorIcon}>⚠️</ThemedText>
            <ThemedText type="title" style={styles.cardTitle}>
              Invalid Invite
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.cardSubtitle}>
              {error}
            </ThemedText>
            <Pressable onPress={router.back} style={styles.secondaryBtn}>
              <ThemedText style={styles.secondaryBtnText}>Back to Groups</ThemedText>
            </Pressable>
          </ThemedView>
        ) : alreadyInGroup ? (
          /* Already in Group View */
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText style={styles.statusIcon}>
              {TYPE_ICONS[alreadyInGroup.type] || '👥'}
            </ThemedText>
            <ThemedText type="title" style={styles.cardTitle}>
              Already a Member
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.cardSubtitle}>
              You are already in &ldquo;{alreadyInGroup.name}&rdquo; on this device.
            </ThemedText>
            <Pressable
              onPress={() =>
                router.replace({
                  pathname: '/groups/[groupId]',
                  params: { groupId: alreadyInGroup.id },
                })
              }
              style={styles.primaryBtn}>
              <ThemedText style={styles.primaryBtnText}>Open Group</ThemedText>
            </Pressable>
          </ThemedView>
        ) : payload ? (
          /* Confirmation Card */
          <ThemedView type="backgroundElement" style={styles.card}>
            <View style={styles.badgeWrapper}>
              <ThemedText style={styles.badgeIcon}>
                {TYPE_ICONS[payload.type] || '👥'}
              </ThemedText>
            </View>

            <ThemedText type="title" style={styles.cardTitle} numberOfLines={2}>
              {payload.name}
            </ThemedText>

            <View style={styles.detailsBox}>
              <View style={styles.detailRow}>
                <ThemedText type="small" themeColor="textSecondary">
                  Category
                </ThemedText>
                <ThemedText style={styles.detailValue}>
                  {TYPE_LABELS[payload.type] || 'Group'}
                </ThemedText>
              </View>

              <View style={styles.detailRow}>
                <ThemedText type="small" themeColor="textSecondary">
                  Currency
                </ThemedText>
                <ThemedText style={styles.detailValue}>
                  {payload.currency}
                </ThemedText>
              </View>

              <View style={styles.detailRow}>
                <ThemedText type="small" themeColor="textSecondary">
                  Invited By
                </ThemedText>
                <ThemedText style={[styles.detailValue, { color: '#3b82f6', fontWeight: '700' }]}>
                  {payload.inviterName}
                </ThemedText>
              </View>
            </View>

            <ThemedText type="small" themeColor="textSecondary" style={styles.hintText}>
              Joining will add this group stub to your device. You can sync nearby with {payload.inviterName} afterwards to download transactions.
            </ThemedText>

            <Pressable
              onPress={handleJoinPress}
              disabled={isJoining}
              style={({ pressed }) => [
                styles.primaryBtn,
                isJoining && { opacity: 0.6 },
                pressed && styles.btnPressed,
              ]}>
              <ThemedText style={styles.primaryBtnText}>
                {isJoining ? 'Joining...' : 'Join Group'}
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={router.back}
              style={({ pressed }) => [styles.cancelBtn, pressed && styles.btnPressed]}>
              <ThemedText style={styles.cancelBtnText}>Cancel</ThemedText>
            </Pressable>
          </ThemedView>
        ) : null}
      </ScrollView>

      {/* Profile Name Modal prompt if missing */}
      <ProfileNameModal
        visible={isNameModalVisible}
        onSave={handleSaveProfileName}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  centerScreen: {
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
    padding: Spacing.four,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
    justifyContent: 'center',
    minHeight: '80%',
  },
  card: {
    padding: Spacing.four,
    borderRadius: 20,
    alignItems: 'center',
    gap: Spacing.three,
  },
  badgeWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  badgeIcon: {
    fontSize: 32,
  },
  statusIcon: {
    fontSize: 54,
    marginTop: Spacing.two,
  },
  errorIcon: {
    fontSize: 54,
    marginTop: Spacing.two,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  cardSubtitle: {
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: Spacing.two,
  },
  detailsBox: {
    width: '100%',
    backgroundColor: 'rgba(150, 150, 150, 0.08)',
    borderRadius: 14,
    padding: Spacing.three,
    gap: 10,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  hintText: {
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: Spacing.two,
  },
  primaryBtn: {
    width: '100%',
    height: 50,
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryBtn: {
    width: '100%',
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(150, 150, 150, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  cancelBtn: {
    paddingVertical: 10,
  },
  cancelBtnText: {
    color: '#ef4444',
    fontSize: 15,
    fontWeight: '600',
  },
  btnPressed: {
    opacity: 0.7,
  },
});
