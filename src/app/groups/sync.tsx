import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { QRDisplay } from '@/components/qr-display';
import { QRScanner } from '@/components/qr-scanner';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { calculateBalances } from '@/services/groups/balances';
import { computeVersionVector, deriveGroupState } from '@/services/groups/eventLog';
import { calculateDelta, mergeEvents } from '@/services/groups/merge';
import {
  EncodedQRBundle,
  encodeQRBundle,
  QRBundle,
} from '@/services/groups/qrCodec';
import {
  loadGroupEvents,
  loadGroupsIndex,
  saveGroupEvents,
  upsertGroupMeta,
} from '@/services/groups/storage';
import {
  DerivedGroupState,
  GroupEvent,
  GroupMeta,
  VersionVector,
} from '@/services/groups/types';
import { formatMoney } from '@/services/groups/utils';

export default function GroupSyncWizardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useTheme();
  const { groupId, role } = useLocalSearchParams<{ groupId: string; role?: string }>();

  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<GroupMeta | null>(null);
  const [events, setEvents] = useState<GroupEvent[]>([]);
  const [state, setState] = useState<DerivedGroupState | null>(null);

  // Sync Flow States
  // step: 1 = summary, 2 = delta B->A, 3 = delta A->B, 4 = success, 'invite' = invite mode
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 'invite'>(role === 'invite' ? 'invite' : 1);
  const [phoneRole, setPhoneRole] = useState<'initiator' | 'receiver'>('initiator'); // initiator = Phone A, receiver = Phone B

  // Staged bundles and stats
  const [summaryBundle, setSummaryBundle] = useState<EncodedQRBundle | null>(null);
  const [inviteBundle, setInviteBundle] = useState<EncodedQRBundle | null>(null);
  const [deltaBundle, setDeltaBundle] = useState<EncodedQRBundle | null>(null);
  const [remoteVector, setRemoteVector] = useState<VersionVector | null>(null);
  const [newEventsMergedCount, setNewEventsMergedCount] = useState(0);

  useEffect(() => {
    if (!groupId) return;

    const init = async () => {
      try {
        const [index, groupEvents] = await Promise.all([
          loadGroupsIndex(),
          loadGroupEvents(groupId),
        ]);

        const foundMeta = index.find((g) => g.id === groupId) || null;
        setMeta(foundMeta);
        setEvents(groupEvents);

        const derived = deriveGroupState(groupId, groupEvents);
        setState(derived);

        const localVv = computeVersionVector(groupEvents);

        // Pre-encode Summary Bundle
        const summary: QRBundle = {
          v: 1,
          type: 'summary',
          groupId,
          name: derived.name,
          vector: localVv,
        };
        setSummaryBundle(encodeQRBundle(summary));

        // Pre-encode Invite Bundle (Full snapshot)
        const invite: QRBundle = {
          v: 1,
          type: 'invite',
          groupId,
          snapshotEvents: groupEvents,
        };
        setInviteBundle(encodeQRBundle(invite));
      } catch (err) {
        console.warn('Failed to initialize sync wizard', err);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [groupId]);

  // Handle scanned bundle
  const handleScannedBundle = async (scanned: QRBundle) => {
    if (scanned.groupId !== groupId) return;

    if (scanned.type === 'summary') {
      // Receiver scanned Initiator's summary!
      // Receiver prepares Delta(B -> A)
      const deltaEvents = calculateDelta(events, scanned.vector);
      const myVv = computeVersionVector(events);
      const deltaBtoA: QRBundle = {
        v: 1,
        type: 'delta',
        groupId,
        events: deltaEvents,
        vector: myVv,
      };
      setDeltaBundle(encodeQRBundle(deltaBtoA));
      setRemoteVector(scanned.vector);
      setCurrentStep(2);
    } else if (scanned.type === 'delta') {
      // Merging incoming delta
      const mergeRes = mergeEvents(events, scanned.events, groupId);
      const updatedEvents = mergeRes.mergedEvents;
      setEvents(updatedEvents);
      setNewEventsMergedCount((prev) => prev + mergeRes.newEventsCount);

      await saveGroupEvents(groupId, updatedEvents, true);
      const updatedState = deriveGroupState(groupId, updatedEvents);
      setState(updatedState);

      if (phoneRole === 'initiator' && currentStep === 2) {
        // Initiator scanned Delta B->A!
        // Initiator prepares Delta A->B
        const deltaAtoB = calculateDelta(updatedEvents, scanned.vector);
        const myVv = computeVersionVector(updatedEvents);
        const deltaBundleObj: QRBundle = {
          v: 1,
          type: 'delta',
          groupId,
          events: deltaAtoB,
          vector: myVv,
        };
        setDeltaBundle(encodeQRBundle(deltaBundleObj));
        setCurrentStep(3);
      } else if (phoneRole === 'receiver' && currentStep === 3) {
        // Receiver scanned Delta A->B!
        // Finished!
        await finalizeSync();
        setCurrentStep(4);
      }
    }
  };

  const finalizeSync = async () => {
    if (!meta) return;
    const now = Date.now();
    const lastSynced = { ...(meta.lastSyncedAt || {}) };
    if (meta.myMemberId) {
      lastSynced[meta.myMemberId] = now;
    }
    const updatedMeta: GroupMeta = {
      ...meta,
      lastSyncedAt: lastSynced,
    };
    setMeta(updatedMeta);
    await upsertGroupMeta(updatedMeta);
  };

  const myNetBalance = useMemo(() => {
    if (!state || !meta?.myMemberId) return 0;
    const bals = calculateBalances(state.expenses, state.settlements, state.members);
    return bals[meta.myMemberId]?.netBalance || 0;
  }, [state, meta]);

  if (loading || !state) {
    return (
      <View style={[styles.loadingScreen, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

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
            {currentStep === 'invite' ? 'Invite Member' : 'Offline QR Sync'}
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
        {/* INVITE FLOW */}
        {currentStep === 'invite' && inviteBundle && (
          <View style={{ gap: Spacing.three }}>
            <View style={styles.stepHeader}>
              <ThemedText type="title" style={styles.stepTitle}>
                Invite to &ldquo;{state.name}&rdquo;
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.stepSubtitle}>
                Have the new person open FinFlow &gt; Groups &gt; &ldquo;Join with QR&rdquo; and point their camera at this code.
              </ThemedText>
            </View>

            <QRDisplay
              encodedBundle={inviteBundle}
              title="Group Invite QR"
              subtitle="Transfers full group history securely"
            />

            <Pressable
              onPress={() => setCurrentStep(1)}
              style={styles.switchSyncBtn}>
              <ThemedText style={styles.switchSyncBtnText}>Switch to 2-Way Sync</ThemedText>
            </Pressable>
          </View>
        )}

        {/* 2-WAY SYNC FLOW: Role selector on Step 1 */}
        {currentStep === 1 && (
          <View style={{ gap: Spacing.three }}>
            <View style={styles.stepHeader}>
              <ThemedText type="title" style={styles.stepTitle}>
                Step 1: Exchange Summary
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.stepSubtitle}>
                Sync balances and expenses between two phones in 3 quick scans.
              </ThemedText>
            </View>

            {/* Role Switcher */}
            <View style={styles.roleSwitcher}>
              <Pressable
                onPress={() => setPhoneRole('initiator')}
                style={[styles.roleBtn, phoneRole === 'initiator' && styles.roleBtnActive]}>
                <ThemedText style={[styles.roleBtnText, phoneRole === 'initiator' && styles.roleBtnTextActive]}>
                  Show Code First
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={() => setPhoneRole('receiver')}
                style={[styles.roleBtn, phoneRole === 'receiver' && styles.roleBtnActive]}>
                <ThemedText style={[styles.roleBtnText, phoneRole === 'receiver' && styles.roleBtnTextActive]}>
                  Scan Code First
                </ThemedText>
              </Pressable>
            </View>

            {phoneRole === 'initiator' ? (
              summaryBundle && (
                <View style={{ gap: Spacing.three }}>
                  <QRDisplay
                    encodedBundle={summaryBundle}
                    title="Summary QR (Phone A)"
                    subtitle="Have Phone B scan this summary code"
                  />
                  <Pressable
                    onPress={() => setCurrentStep(2)}
                    style={styles.manualAdvanceBtn}>
                    <ThemedText style={styles.manualAdvanceBtnText}>
                      Next: Scan Phone B&rsquo;s Code ›
                    </ThemedText>
                  </Pressable>
                </View>
              )
            ) : (
              <View style={{ gap: Spacing.three }}>
                <QRScanner
                  expectedGroupId={groupId}
                  instructionText="Point camera at Phone A's Summary QR code"
                  onBundleScanned={handleScannedBundle}
                />
              </View>
            )}
          </View>
        )}

        {/* STEP 2: Delta B -> A */}
        {currentStep === 2 && (
          <View style={{ gap: Spacing.three }}>
            <View style={styles.stepHeader}>
              <ThemedText type="title" style={styles.stepTitle}>
                Step 2: Sync New Data
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.stepSubtitle}>
                {phoneRole === 'receiver'
                  ? 'Showing your latest updates. Phone A will scan this.'
                  : 'Scan the update QR code shown on Phone B.'}
              </ThemedText>
            </View>

            {phoneRole === 'receiver' && deltaBundle ? (
              <View style={{ gap: Spacing.three }}>
                <QRDisplay
                  encodedBundle={deltaBundle}
                  title="Update Code (B → A)"
                  subtitle="Hold for Phone A to scan"
                />
                <Pressable
                  onPress={() => setCurrentStep(3)}
                  style={styles.manualAdvanceBtn}>
                  <ThemedText style={styles.manualAdvanceBtnText}>
                    Next: Scan Phone A&rsquo;s Final Code ›
                  </ThemedText>
                </Pressable>
              </View>
            ) : (
              <View style={{ gap: Spacing.three }}>
                <QRScanner
                  expectedGroupId={groupId}
                  instructionText="Point camera at Phone B's Update QR code"
                  onBundleScanned={handleScannedBundle}
                />
              </View>
            )}
          </View>
        )}

        {/* STEP 3: Delta A -> B */}
        {currentStep === 3 && (
          <View style={{ gap: Spacing.three }}>
            <View style={styles.stepHeader}>
              <ThemedText type="title" style={styles.stepTitle}>
                Step 3: Final Handshake
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.stepSubtitle}>
                {phoneRole === 'initiator'
                  ? 'Showing remaining updates. Phone B will scan this.'
                  : 'Scan the final update QR code shown on Phone A.'}
              </ThemedText>
            </View>

            {phoneRole === 'initiator' && deltaBundle ? (
              <View style={{ gap: Spacing.three }}>
                <QRDisplay
                  encodedBundle={deltaBundle}
                  title="Final Update (A → B)"
                  subtitle="Hold for Phone B to scan"
                />
                <Pressable
                  onPress={async () => {
                    await finalizeSync();
                    setCurrentStep(4);
                  }}
                  style={styles.manualAdvanceBtn}>
                  <ThemedText style={styles.manualAdvanceBtnText}>
                    Finish Sync ›
                  </ThemedText>
                </Pressable>
              </View>
            ) : (
              <View style={{ gap: Spacing.three }}>
                <QRScanner
                  expectedGroupId={groupId}
                  instructionText="Point camera at Phone A's Final QR code"
                  onBundleScanned={handleScannedBundle}
                />
              </View>
            )}
          </View>
        )}

        {/* STEP 4: Success Screen */}
        {currentStep === 4 && (
          <ThemedView type="backgroundElement" style={styles.successCard}>
            <ThemedText style={styles.successIcon}>🎉</ThemedText>
            <ThemedText type="title" style={styles.successTitle}>
              Sync Complete!
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.successSubtitle}>
              Both phones now have identical, up-to-date group logs and balances.
            </ThemedText>

            <View style={styles.statsBox}>
              <ThemedText style={styles.statLine}>
                ✅ {newEventsMergedCount} new updates merged
              </ThemedText>
              <ThemedText style={styles.statLine}>
                👥 {state.members.length} members in sync
              </ThemedText>
              <ThemedText style={styles.statLine}>
                🧾 {state.expenses.length} total group expenses
              </ThemedText>
              <ThemedText style={[styles.statLine, { fontWeight: '700', marginTop: 4 }]}>
                💰 Your Net Balance: {formatMoney(myNetBalance, state.currency)}
              </ThemedText>
            </View>

            <Pressable
              onPress={() => router.replace({ pathname: '/groups/[groupId]', params: { groupId } })}
              style={styles.doneBtn}>
              <ThemedText style={styles.doneBtnText}>Return to Group</ThemedText>
            </Pressable>
          </ThemedView>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
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
  },
  stepHeader: {
    gap: 4,
    marginBottom: Spacing.two,
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: '800',
  },
  stepSubtitle: {
    lineHeight: 18,
  },
  roleSwitcher: {
    flexDirection: 'row',
    gap: Spacing.two,
    backgroundColor: 'rgba(150, 150, 150, 0.15)',
    padding: 4,
    borderRadius: 12,
  },
  roleBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 9,
  },
  roleBtnActive: {
    backgroundColor: '#3b82f6',
  },
  roleBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  roleBtnTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  manualAdvanceBtn: {
    height: 46,
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  manualAdvanceBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  switchSyncBtn: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(150, 150, 150, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  switchSyncBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  successCard: {
    padding: Spacing.five,
    borderRadius: 20,
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  successIcon: {
    fontSize: 54,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '800',
  },
  successSubtitle: {
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: Spacing.two,
  },
  statsBox: {
    width: '100%',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 12,
    padding: Spacing.three,
    gap: 6,
    marginBottom: Spacing.two,
  },
  statLine: {
    fontSize: 14,
  },
  doneBtn: {
    width: '100%',
    height: 48,
    backgroundColor: '#10b981',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  doneBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
