import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { QRDisplay } from '@/components/qr-display';
import { QRScanner } from '@/components/qr-scanner';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createGroupEvent, deriveGroupState } from '@/services/groups/eventLog';
import { EncodedQRBundle, encodeQRBundle, QRBundle } from '@/services/groups/qrCodec';
import {
  getOrCreateDeviceId,
  saveGroupEvents,
  upsertGroupMeta,
} from '@/services/groups/storage';
import {
  DerivedGroupState,
  GroupEvent,
  GroupMeta,
  Member,
} from '@/services/groups/types';
import { generateUUID } from '@/services/groups/uuid';
import { loadAppSettings } from '@/services/storage';

export default function JoinGroupScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useTheme();

  // steps: 'scan' | 'identity' | 'sync_back'
  const [step, setStep] = useState<'scan' | 'identity' | 'sync_back'>('scan');
  const [scannedEvents, setScannedEvents] = useState<GroupEvent[]>([]);
  const [derivedState, setDerivedState] = useState<DerivedGroupState | null>(null);

  const [chosenMemberId, setChosenMemberId] = useState<string | null>(null);
  const [deltaBundle, setDeltaBundle] = useState<EncodedQRBundle | null>(null);
  const [joinedGroupId, setJoinedGroupId] = useState<string | null>(null);

  // Handle scanned bundle
  const handleBundleScanned = (bundle: QRBundle) => {
    if (bundle.type !== 'invite') {
      Alert.alert(
        'Invalid Code',
        'Please scan an Invite QR code. You can ask an existing group member to open the group and tap "Invite via QR".'
      );
      return;
    }

    const state = deriveGroupState(bundle.groupId, bundle.snapshotEvents);
    setScannedEvents(bundle.snapshotEvents);
    setDerivedState(state);
    setJoinedGroupId(bundle.groupId);
    setStep('identity');
  };

  // Choose to join as a new member
  const handleJoinAsNew = async () => {
    if (!derivedState || !joinedGroupId) return;

    try {
      const settings = await loadAppSettings();
      const deviceId = await getOrCreateDeviceId();
      const myName = settings.profileName?.trim() || 'New Member';
      const myMemberId = generateUUID();

      const newMember: Member = {
        id: myMemberId,
        name: myName,
        kind: 'device',
        claimedByDeviceId: deviceId,
      };

      const addEvent = createGroupEvent(
        joinedGroupId,
        deviceId,
        'member_added',
        { member: newMember },
        scannedEvents
      );

      const allEvents = [...scannedEvents, addEvent];
      await saveGroupEvents(joinedGroupId, allEvents, true);

      const meta: GroupMeta = {
        id: joinedGroupId,
        name: derivedState.name,
        type: derivedState.type,
        currency: derivedState.currency,
        createdAt: derivedState.createdAt,
        myMemberId,
        status: derivedState.status,
      };
      await upsertGroupMeta(meta);

      // Prepare delta to sync back to creator
      const delta: QRBundle = {
        v: 1,
        type: 'delta',
        groupId: joinedGroupId,
        events: [addEvent],
        vector: { [deviceId]: 1 },
      };
      setDeltaBundle(encodeQRBundle(delta));
      setChosenMemberId(myMemberId);
      setStep('sync_back');
    } catch (err) {
      console.warn('Failed to join group', err);
      Alert.alert('Error', 'Failed to join group.');
    }
  };

  // Choose to claim an existing ghost member
  const handleClaimGhost = async (ghost: Member) => {
    if (!derivedState || !joinedGroupId) return;

    try {
      const deviceId = await getOrCreateDeviceId();
      const claimEvent = createGroupEvent(
        joinedGroupId,
        deviceId,
        'member_claimed',
        { memberId: ghost.id, deviceId },
        scannedEvents
      );

      const allEvents = [...scannedEvents, claimEvent];
      await saveGroupEvents(joinedGroupId, allEvents, true);

      const meta: GroupMeta = {
        id: joinedGroupId,
        name: derivedState.name,
        type: derivedState.type,
        currency: derivedState.currency,
        createdAt: derivedState.createdAt,
        myMemberId: ghost.id,
        status: derivedState.status,
      };
      await upsertGroupMeta(meta);

      const delta: QRBundle = {
        v: 1,
        type: 'delta',
        groupId: joinedGroupId,
        events: [claimEvent],
        vector: { [deviceId]: 1 },
      };
      setDeltaBundle(encodeQRBundle(delta));
      setChosenMemberId(ghost.id);
      setStep('sync_back');
    } catch (err) {
      console.warn('Failed to claim ghost member', err);
      Alert.alert('Error', 'Failed to claim member.');
    }
  };

  const unclaimedGhosts = derivedState
    ? derivedState.members.filter((m) => m.kind === 'ghost' && !m.claimedByDeviceId)
    : [];

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
            <ThemedText style={styles.backText}>Cancel</ThemedText>
          </Pressable>

          <ThemedText style={styles.navBarTitle} numberOfLines={1}>
            Join Group
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
        {/* STEP 1: Scan Invite QR */}
        {step === 'scan' && (
          <View style={{ gap: Spacing.three }}>
            <View style={styles.header}>
              <ThemedText type="title" style={styles.title}>
                Scan Group Invite
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
                Ask someone in the group to tap &ldquo;Invite (QR)&rdquo; and point your camera at their screen.
              </ThemedText>
            </View>

            <QRScanner
              instructionText="Scan the group invite code"
              onBundleScanned={handleBundleScanned}
            />
          </View>
        )}

        {/* STEP 2: Choose Identity */}
        {step === 'identity' && derivedState && (
          <View style={{ gap: Spacing.three }}>
            <View style={styles.header}>
              <ThemedText type="title" style={styles.title}>
                Join &ldquo;{derivedState.name}&rdquo;
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
                Choose how you want to be represented in this group.
              </ThemedText>
            </View>

            {/* Option A: Join as new */}
            <ThemedView type="backgroundElement" style={styles.card}>
              <View style={styles.cardHeader}>
                <ThemedText style={styles.cardIcon}>✨</ThemedText>
                <ThemedText type="smallBold">I&rsquo;M NEW TO THIS GROUP</ThemedText>
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                Creates a new profile for you using your device name.
              </ThemedText>
              <Pressable onPress={handleJoinAsNew} style={styles.primaryActionBtn}>
                <ThemedText style={styles.primaryActionBtnText}>Join as New Member</ThemedText>
              </Pressable>
            </ThemedView>

            {/* Option B: Claim an existing ghost */}
            {unclaimedGhosts.length > 0 && (
              <ThemedView type="backgroundElement" style={styles.card}>
                <View style={styles.cardHeader}>
                  <ThemedText style={styles.cardIcon}>🔗</ThemedText>
                  <ThemedText type="smallBold">I&rsquo;M ALREADY IN THIS GROUP</ThemedText>
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  Did someone already add you as a person without the app? Claim your profile below:
                </ThemedText>

                <View style={styles.ghostList}>
                  {unclaimedGhosts.map((ghost) => (
                    <View key={ghost.id} style={styles.ghostRow}>
                      <ThemedText style={styles.ghostName}>{ghost.name}</ThemedText>
                      <Pressable
                        onPress={() => handleClaimGhost(ghost)}
                        style={styles.claimGhostBtn}>
                        <ThemedText style={styles.claimGhostBtnText}>That&rsquo;s Me</ThemedText>
                      </Pressable>
                    </View>
                  ))}
                </View>
              </ThemedView>
            )}
          </View>
        )}

        {/* STEP 3: Sync back to group member */}
        {step === 'sync_back' && deltaBundle && joinedGroupId && (
          <View style={{ gap: Spacing.three }}>
            <View style={styles.header}>
              <ThemedText type="title" style={styles.title}>
                Registration Complete!
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
                Hold this update code for the group member to scan so their app registers you.
              </ThemedText>
            </View>

            <QRDisplay
              encodedBundle={deltaBundle}
              title="Membership Update QR"
              subtitle="Hold for the group host to scan"
            />

            <Pressable
              onPress={() => router.replace({ pathname: '/groups/[groupId]', params: { groupId: joinedGroupId } })}
              style={styles.doneBtn}>
              <ThemedText style={styles.doneBtnText}>Go to Group</ThemedText>
            </Pressable>
          </View>
        )}
      </ScrollView>
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
    color: '#ef4444',
    marginTop: -2,
  },
  backText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#ef4444',
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
    gap: Spacing.three,
  },
  header: {
    gap: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
  },
  subtitle: {
    lineHeight: 18,
  },
  card: {
    padding: Spacing.three,
    borderRadius: 16,
    gap: Spacing.two,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardIcon: {
    fontSize: 20,
  },
  primaryActionBtn: {
    height: 46,
    backgroundColor: '#3b82f6',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  primaryActionBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  ghostList: {
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  ghostRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(150, 150, 150, 0.2)',
  },
  ghostName: {
    fontSize: 16,
    fontWeight: '600',
  },
  claimGhostBtn: {
    backgroundColor: '#10b981',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  claimGhostBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  doneBtn: {
    height: 48,
    backgroundColor: '#10b981',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  doneBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
