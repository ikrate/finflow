import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  AppStateStatus,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { calculateBalances } from '@/services/groups/balances';
import { createGroupEvent, deriveGroupState } from '@/services/groups/eventLog';
import { loadAppSettings } from '@/services/storage';
import {
  ensureGroupKey,
  getOrCreateDeviceId,
  loadGroupEvents,
  loadGroupsIndex,
  saveGroupEvents,
  upsertGroupMeta,
} from '@/services/groups/storage';
import {
  DerivedGroupState,
  GroupEvent,
  GroupMeta,
  Member,
} from '@/services/groups/types';
import {
  computeGroupHash,
  createHandshakeContext,
  verifyHandshakeContext,
} from '@/services/groups/sync/auth';
import {
  SyncProgress,
  SyncSession,
  SyncSummary,
  shouldInitiateSimultaneousInvite,
} from '@/services/groups/sync/protocol';
import {
  defaultMultipeerTransport,
  isMultipeerSupported,
  PeerFoundEvent,
  PeerStateEvent,
} from '../../../modules/finflow-peer/src';
import { formatMoney } from '@/services/groups/utils';

interface IncomingInvitationModalState {
  invitationId: string;
  peerId: string;
  displayName: string;
  isVerified: boolean;
}

export default function GroupSyncScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useTheme();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();

  // State
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<GroupMeta | null>(null);
  const [events, setEvents] = useState<GroupEvent[]>([]);
  const [state, setState] = useState<DerivedGroupState | null>(null);
  const [profileName, setProfileName] = useState('FinFlow User');
  const [localDeviceId, setLocalDeviceId] = useState('');

  // Peer discovery & connection
  const [foundPeers, setFoundPeers] = useState<Array<{ peerId: string; displayName: string }>>([]);
  const [peerStates, setPeerStates] = useState<Record<string, 'connecting' | 'connected' | 'disconnected'>>({});
  const [currentSyncPeerId, setCurrentSyncPeerId] = useState<string | null>(null);
  const [outgoingInvitePeerId, setOutgoingInvitePeerId] = useState<string | null>(null);
  const [incomingInvite, setIncomingInvite] = useState<IncomingInvitationModalState | null>(null);

  // Discovery timeout & troubleshooting
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);

  // Sync session & steps
  // 'discovery' | 'syncing' | 'identity' | 'syncing_identity' | 'summary'
  const [screenStep, setScreenStep] = useState<'discovery' | 'syncing' | 'identity' | 'syncing_identity' | 'summary'>('discovery');
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [peerSummaries, setPeerSummaries] = useState<Record<string, SyncSummary>>({});
  const [lastSummary, setLastSummary] = useState<SyncSummary | null>(null);

  // Refs for callbacks & listeners
  const activeSessionRef = useRef<SyncSession | null>(null);
  const metaRef = useRef<GroupMeta | null>(null);
  metaRef.current = meta;
  const eventsRef = useRef<GroupEvent[]>([]);
  eventsRef.current = events;
  const currentSyncPeerIdRef = useRef<string | null>(null);
  currentSyncPeerIdRef.current = currentSyncPeerId;
  const outgoingInvitePeerIdRef = useRef<string | null>(null);
  outgoingInvitePeerIdRef.current = outgoingInvitePeerId;
  const localDeviceIdRef = useRef('');
  localDeviceIdRef.current = localDeviceId;
  const screenStepRef = useRef(screenStep);
  screenStepRef.current = screenStep;

  const supported = isMultipeerSupported();

  // 1. Initialize local data & identity
  useEffect(() => {
    if (!groupId) return;

    let isMounted = true;

    const init = async () => {
      try {
        const [ensuredKey, groupEvents, settings, deviceId, index] = await Promise.all([
          ensureGroupKey(groupId),
          loadGroupEvents(groupId),
          loadAppSettings(),
          getOrCreateDeviceId(),
          loadGroupsIndex(),
        ]);

        if (!isMounted) return;

        const foundMeta = index.find((g) => g.id === groupId) || null;
        if (foundMeta) {
          foundMeta.groupKey = ensuredKey;
        }
        setMeta(foundMeta);
        setEvents(groupEvents);
        setLocalDeviceId(deviceId);

        const name = (settings.profileName || 'FinFlow User').trim().slice(0, 30);
        setProfileName(name);

        const derived = deriveGroupState(groupId, groupEvents);
        setState(derived);
      } catch (err) {
        console.warn('Failed to initialize sync screen', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    init();

    return () => {
      isMounted = false;
    };
  }, [groupId]);

  // 2. Start Multipeer Transport & Event Listeners
  useEffect(() => {
    if (!supported || !groupId || loading || !meta) return;

    let discoveryTimeout: ReturnType<typeof setTimeout> | null = null;

    const startDiscovery = async () => {
      try {
        setShowTroubleshooting(false);
        const groupHash = computeGroupHash(groupId);
        await defaultMultipeerTransport.start({
          displayName: profileName,
          groupHash,
        });

        // 20-second timeout to show troubleshooting if no peers found
        discoveryTimeout = setTimeout(() => {
          setFoundPeers((current) => {
            if (current.length === 0) {
              setShowTroubleshooting(true);
            }
            return current;
          });
        }, 20000);
      } catch (err) {
        console.warn('Failed to start Multipeer transport', err);
        setShowTroubleshooting(true);
      }
    };

    startDiscovery();

    // Listeners
    const unsubFound = defaultMultipeerTransport.onPeerFound((e: PeerFoundEvent) => {
      setFoundPeers((prev) => {
        const exists = prev.some((p) => p.peerId === e.peerId);
        if (exists) {
          return prev.map((p) => (p.peerId === e.peerId ? { peerId: e.peerId, displayName: e.displayName } : p));
        }
        return [...prev, { peerId: e.peerId, displayName: e.displayName }];
      });
      setShowTroubleshooting(false);
    });

    const unsubLost = defaultMultipeerTransport.onPeerLost((e) => {
      setFoundPeers((prev) => prev.filter((p) => p.peerId !== e.peerId));
    });

    const unsubState = defaultMultipeerTransport.onPeerState((e: PeerStateEvent) => {
      setPeerStates((prev) => ({ ...prev, [e.peerId]: e.state }));

      if (e.state === 'connected' && currentSyncPeerIdRef.current === e.peerId) {
        // Peer connected, start sync session
        startActiveSession(e.peerId);
      } else if (e.state === 'disconnected') {
        if (currentSyncPeerIdRef.current === e.peerId) {
          if (activeSessionRef.current) {
            activeSessionRef.current.cleanup();
            activeSessionRef.current = null;
          }
          if (screenStepRef.current === 'syncing') {
            setSyncError('Connection to peer was lost mid-sync. Merged data is safe.');
            setCurrentSyncPeerId(null);
            setScreenStep('discovery');
          }
        }
      }
    });

    const unsubInvite = defaultMultipeerTransport.onInvitation(async (inv) => {
      const currentKey = metaRef.current?.groupKey;
      if (!currentKey) {
        await defaultMultipeerTransport.respondToInvitation(inv.invitationId, false);
        return;
      }

      const verifyRes = verifyHandshakeContext(inv.context, currentKey, groupId);

      // Malformed: reject silently
      if (verifyRes.isMalformed) {
        await defaultMultipeerTransport.respondToInvitation(inv.invitationId, false);
        return;
      }

      // Check simultaneous invitation tie-break
      if (outgoingInvitePeerIdRef.current === inv.peerId && verifyRes.deviceId) {
        const shouldIInvite = shouldInitiateSimultaneousInvite(localDeviceIdRef.current, verifyRes.deviceId);
        if (shouldIInvite) {
          // Lower deviceId invites; remote peer will accept our invitation. Reject incoming.
          await defaultMultipeerTransport.respondToInvitation(inv.invitationId, false);
          return;
        } else {
          // Higher deviceId accepts. Clear our outgoing invite and auto-accept incoming.
          setOutgoingInvitePeerId(null);
          setCurrentSyncPeerId(inv.peerId);
          setScreenStep('syncing');
          setSyncProgress({ phase: 'connecting', count: 0, total: 1 });
          await defaultMultipeerTransport.respondToInvitation(inv.invitationId, true);
          return;
        }
      }

      // Present invitation prompt
      setIncomingInvite({
        invitationId: inv.invitationId,
        peerId: inv.peerId,
        displayName: inv.displayName,
        isVerified: verifyRes.valid,
      });
    });

    const unsubError = defaultMultipeerTransport.onError((err) => {
      console.warn('Multipeer transport error', err);
      if (currentSyncPeerIdRef.current) {
        setSyncError(err.message || 'Sync error occurred');
      }
    });

    // AppState handling: stop on background, resume on active
    const appStateSub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        if (activeSessionRef.current) {
          activeSessionRef.current.cleanup();
          activeSessionRef.current = null;
        }
        defaultMultipeerTransport.stop().catch(() => {});
      } else if (nextState === 'active') {
        startDiscovery();
      }
    });

    return () => {
      if (discoveryTimeout) clearTimeout(discoveryTimeout);
      unsubFound();
      unsubLost();
      unsubState();
      unsubInvite();
      unsubError();
      appStateSub.remove();
      if (activeSessionRef.current) {
        activeSessionRef.current.cleanup();
        activeSessionRef.current = null;
      }
      defaultMultipeerTransport.stop().catch(() => {});
    };
  }, [supported, groupId, loading, meta?.id]);

  // 3. Start or attach active sync session
  const startActiveSession = useCallback(
    async (peerId: string) => {
      if (activeSessionRef.current) {
        activeSessionRef.current.cleanup();
      }

      const session = new SyncSession({
        transport: defaultMultipeerTransport,
        groupId,
        localDeviceId: localDeviceIdRef.current,
        localMemberId: metaRef.current?.myMemberId,
        getLocalEvents: async () => await loadGroupEvents(groupId),
        saveLocalEvents: async (updatedEvents) => {
          await saveGroupEvents(groupId, updatedEvents, true);
          const freshDerived = deriveGroupState(groupId, updatedEvents);
          setState(freshDerived);
          setEvents(updatedEvents);
        },
        onProgress: (prog) => {
          setSyncProgress(prog);
        },
        onComplete: async (summary) => {
          await handleSyncCompletion(peerId, summary);
        },
        onError: (err) => {
          setSyncError(err.message || 'Sync error occurred');
          setCurrentSyncPeerId(null);
          setScreenStep('discovery');
          activeSessionRef.current?.cleanup();
          activeSessionRef.current = null;
        },
      });

      activeSessionRef.current = session;
      session.attach(peerId);
      // Immediately send hello
      await session.sendHello();
    },
    [groupId]
  );

  // 4. Handle Sync Completion
  const handleSyncCompletion = async (peerId: string, summary: SyncSummary) => {
    try {
      const currentMeta = metaRef.current;
      if (currentMeta) {
        const lastSynced = { ...(currentMeta.lastSyncedAt || {}) };
        if (summary.remoteMemberId) {
          lastSynced[summary.remoteMemberId] = Date.now();
        }
        const updatedMeta: GroupMeta = {
          ...currentMeta,
          lastSyncedAt: lastSynced,
        };
        await upsertGroupMeta(updatedMeta);
        setMeta(updatedMeta);
      }

      setPeerSummaries((prev) => ({ ...prev, [peerId]: summary }));
      setLastSummary(summary);

      const freshEvents = await loadGroupEvents(groupId);
      const freshDerived = deriveGroupState(groupId, freshEvents);
      setEvents(freshEvents);
      setState(freshDerived);

      // Check if identity selection is required (first-time joiner)
      if (currentMeta?.needsFirstSync) {
        setScreenStep('identity');
      } else {
        setScreenStep('summary');
      }
    } catch (err) {
      console.warn('Error handling sync completion', err);
      setScreenStep('summary');
    }
  };

  // 5. User taps "Sync" on a found peer
  const handleSyncPeer = async (peer: { peerId: string; displayName: string }) => {
    if (screenStep === 'syncing' || !meta) return;
    const currentKey = meta.groupKey;
    if (!currentKey) {
      setSyncError('Group encryption key not found. Please try again.');
      return;
    }

    setSyncError(null);
    setCurrentSyncPeerId(peer.peerId);
    setOutgoingInvitePeerId(peer.peerId);
    setScreenStep('syncing');
    setSyncProgress({ phase: 'connecting', count: 0, total: 1 });

    try {
      const context = createHandshakeContext(currentKey, groupId, localDeviceId);
      await defaultMultipeerTransport.invite(peer.peerId, context);
    } catch (err) {
      console.warn('Failed to send Multipeer invitation', err);
      setSyncError(`Failed to invite ${peer.displayName}. Try again.`);
      setCurrentSyncPeerId(null);
      setOutgoingInvitePeerId(null);
      setScreenStep('discovery');
    }
  };

  // 6. User responds to incoming invitation
  const handleAcceptInvitation = async () => {
    if (!incomingInvite) return;
    const { invitationId, peerId } = incomingInvite;
    setIncomingInvite(null);
    setCurrentSyncPeerId(peerId);
    setScreenStep('syncing');
    setSyncProgress({ phase: 'connecting', count: 0, total: 1 });

    try {
      await defaultMultipeerTransport.respondToInvitation(invitationId, true);
    } catch (err) {
      console.warn('Failed to accept invitation', err);
      setSyncError('Failed to accept invitation.');
      setCurrentSyncPeerId(null);
      setScreenStep('discovery');
    }
  };

  const handleRejectInvitation = async () => {
    if (!incomingInvite) return;
    const { invitationId } = incomingInvite;
    setIncomingInvite(null);
    try {
      await defaultMultipeerTransport.respondToInvitation(invitationId, false);
    } catch (err) {
      console.warn('Failed to reject invitation', err);
    }
  };

  // 7. Identity Selection (Part 1, Step 4)
  const handleJoinAsNew = async () => {
    if (!state || !meta) return;

    try {
      const newMemberId = 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      const myName = profileName.trim() || 'New Member';
      const newMember: Member = {
        id: newMemberId,
        name: myName,
        kind: 'device',
        claimedByDeviceId: localDeviceId,
      };

      const addEvent = createGroupEvent(
        groupId,
        localDeviceId,
        'member_added',
        { member: newMember },
        events
      );

      const updatedEvents = [...events, addEvent];
      await saveGroupEvents(groupId, updatedEvents, true);
      const updatedState = deriveGroupState(groupId, updatedEvents);
      setEvents(updatedEvents);
      setState(updatedState);

      const updatedMeta: GroupMeta = {
        ...meta,
        myMemberId: newMemberId,
        needsFirstSync: false,
      };
      await upsertGroupMeta(updatedMeta);
      setMeta(updatedMeta);

      // Run automatic round 2 so the peer receives this new member!
      await triggerIdentityRegistrationRound();
    } catch (err) {
      console.warn('Failed to create new member profile', err);
      Alert.alert('Error', 'Failed to register profile.');
    }
  };

  const handleClaimGhost = async (ghost: Member) => {
    if (!state || !meta) return;

    try {
      const claimEvent = createGroupEvent(
        groupId,
        localDeviceId,
        'member_claimed',
        { memberId: ghost.id, deviceId: localDeviceId },
        events
      );

      const updatedEvents = [...events, claimEvent];
      await saveGroupEvents(groupId, updatedEvents, true);
      const updatedState = deriveGroupState(groupId, updatedEvents);
      setEvents(updatedEvents);
      setState(updatedState);

      const updatedMeta: GroupMeta = {
        ...meta,
        myMemberId: ghost.id,
        needsFirstSync: false,
      };
      await upsertGroupMeta(updatedMeta);
      setMeta(updatedMeta);

      // Run automatic round 2
      await triggerIdentityRegistrationRound();
    } catch (err) {
      console.warn('Failed to claim ghost member', err);
      Alert.alert('Error', 'Failed to claim profile.');
    }
  };

  const triggerIdentityRegistrationRound = async () => {
    if (activeSessionRef.current) {
      setScreenStep('syncing_identity');
      setSyncProgress({ phase: 'sending_delta', count: 1, total: 1 });
      try {
        await activeSessionRef.current.startNextRound();
      } catch (err) {
        console.warn('Identity round sync failed, continuing', err);
        setScreenStep('summary');
      }
    } else {
      setScreenStep('summary');
    }
  };

  // Retry discovery action
  const handleRetryDiscovery = async () => {
    if (!meta) return;
    try {
      setShowTroubleshooting(false);
      await defaultMultipeerTransport.stop();
      const groupHash = computeGroupHash(groupId);
      await defaultMultipeerTransport.start({ displayName: profileName, groupHash });
    } catch (err) {
      console.warn('Retry discovery failed', err);
    }
  };

  const unclaimedGhosts = useMemo(() => {
    if (!state) return [];
    return state.members.filter((m) => m.kind === 'ghost' && !m.claimedByDeviceId);
  }, [state]);

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

  // Fallback for non-iOS platforms
  if (!supported) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.navBar, { paddingTop: Math.max(insets.top, 10), backgroundColor: theme.background }]}>
          <View style={styles.navBarContent}>
            <Pressable hitSlop={12} onPress={router.back} style={styles.backBtn}>
              <ThemedText style={styles.backChevron}>‹</ThemedText>
              <ThemedText style={styles.backText}>Cancel</ThemedText>
            </Pressable>
            <ThemedText style={styles.navBarTitle}>Nearby Sync</ThemedText>
            <View style={styles.navBarRightPlaceholder} />
          </View>
        </View>

        <View style={styles.unsupportedContainer}>
          <ThemedText style={styles.unsupportedIcon}>📱</ThemedText>
          <ThemedText type="title" style={styles.unsupportedTitle}>
            Nearby sync is available on iOS only
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.unsupportedSubtitle}>
            Offline peer-to-peer sync utilizes Apple&rsquo;s Multipeer Connectivity framework to discover and exchange group expenses directly between nearby iPhones without internet.
          </ThemedText>
          <Pressable onPress={router.back} style={styles.primaryBtn}>
            <ThemedText style={styles.primaryBtnText}>Return to Group</ThemedText>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Navigation Bar */}
      <View style={[styles.navBar, { paddingTop: Math.max(insets.top, 10), backgroundColor: theme.background }]}>
        <View style={styles.navBarContent}>
          <Pressable
            hitSlop={12}
            onPress={() => {
              if (activeSessionRef.current) {
                activeSessionRef.current.cleanup();
                activeSessionRef.current = null;
              }
              defaultMultipeerTransport.stop().catch(() => {});
              router.back();
            }}
            style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}>
            <ThemedText style={styles.backChevron}>‹</ThemedText>
            <ThemedText style={styles.backText}>Close</ThemedText>
          </Pressable>

          <ThemedText style={styles.navBarTitle} numberOfLines={1}>
            {meta?.needsFirstSync ? 'First-Time Sync' : 'Nearby Sync'}
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
        {/* FIRST-SYNC HEADER */}
        {meta?.needsFirstSync && screenStep === 'discovery' && (
          <ThemedView type="backgroundElement" style={styles.firstSyncBanner}>
            <ThemedText style={styles.firstSyncBannerIcon}>✨</ThemedText>
            <View style={{ flex: 1, gap: 2 }}>
              <ThemedText type="smallBold">Almost there!</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Tap &ldquo;Sync&rdquo; next to a nearby group member to download the group history and set up your member profile.
              </ThemedText>
            </View>
          </ThemedView>
        )}

        {/* ERROR CARD */}
        {syncError && (
          <View style={styles.errorBanner}>
            <ThemedText style={styles.errorText}>{syncError}</ThemedText>
            <Pressable
              onPress={() => {
                setSyncError(null);
                setScreenStep('discovery');
              }}
              style={styles.errorRetryBtn}>
              <ThemedText style={styles.errorRetryText}>Dismiss</ThemedText>
            </Pressable>
          </View>
        )}

        {/* STEP 1: DISCOVERY & PEER LIST */}
        {screenStep === 'discovery' && (
          <View style={{ gap: Spacing.three }}>
            <View style={styles.stepHeader}>
              <ThemedText type="title" style={styles.stepTitle}>
                Nearby Members
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.stepSubtitle}>
                Both phones must have this Sync screen open and be within Bluetooth / Wi-Fi range.
              </ThemedText>
            </View>

            {/* Live discovery indicator */}
            <View style={styles.discoveryStatusRow}>
              <ActivityIndicator size="small" color="#3b82f6" />
              <ThemedText type="small" themeColor="textSecondary">
                Looking for nearby members of &ldquo;{state.name}&rdquo;...
              </ThemedText>
            </View>

            {/* Found Peers List */}
            {foundPeers.length === 0 ? (
              <ThemedView type="backgroundElement" style={styles.emptyPeersCard}>
                <ThemedText style={styles.emptyPeersIcon}>📡</ThemedText>
                <ThemedText type="smallBold">Searching for peers...</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.emptyPeersSubtitle}>
                  Make sure other group members have FinFlow open to the Sync screen on their iPhone.
                </ThemedText>
              </ThemedView>
            ) : (
              <View style={styles.peersList}>
                {foundPeers.map((peer) => {
                  const summary = peerSummaries[peer.peerId];
                  return (
                    <ThemedView key={peer.peerId} type="backgroundElement" style={styles.peerCard}>
                      <View style={styles.peerAvatar}>
                        <ThemedText style={styles.peerAvatarText}>
                          {peer.displayName.slice(0, 1).toUpperCase()}
                        </ThemedText>
                      </View>
                      <View style={styles.peerInfo}>
                        <ThemedText style={styles.peerName}>{peer.displayName}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {summary
                            ? '✅ Synced just now'
                            : peerStates[peer.peerId] === 'connected'
                            ? 'Connected'
                            : 'Ready to sync'}
                        </ThemedText>
                      </View>
                      <Pressable
                        onPress={() => handleSyncPeer(peer)}
                        style={({ pressed }) => [styles.syncActionBtn, pressed && styles.btnPressed]}>
                        <ThemedText style={styles.syncActionBtnText}>Sync</ThemedText>
                      </Pressable>
                    </ThemedView>
                  );
                })}
              </View>
            )}

            {/* Troubleshooting / Permission guidance banner */}
            {showTroubleshooting && (
              <ThemedView type="backgroundElement" style={styles.troubleCard}>
                <ThemedText style={styles.troubleIcon}>💡</ThemedText>
                <View style={{ flex: 1, gap: 4 }}>
                  <ThemedText type="smallBold">Can&rsquo;t find nearby members?</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Both phones need the Sync screen open and Local Network permission allowed for FinFlow in iOS Settings.
                  </ThemedText>
                  <View style={styles.troubleActions}>
                    <Pressable
                      onPress={() => Linking.openSettings()}
                      style={styles.settingsLinkBtn}>
                      <ThemedText style={styles.settingsLinkText}>Open iOS Settings</ThemedText>
                    </Pressable>
                    <Pressable onPress={handleRetryDiscovery} style={styles.retryBtn}>
                      <ThemedText style={styles.retryBtnText}>Retry Discovery</ThemedText>
                    </Pressable>
                  </View>
                </View>
              </ThemedView>
            )}
          </View>
        )}

        {/* STEP 2: ACTIVE SYNC PROGRESS */}
        {(screenStep === 'syncing' || screenStep === 'syncing_identity') && (
          <ThemedView type="backgroundElement" style={styles.progressCard}>
            <ActivityIndicator size="large" color="#3b82f6" />
            <ThemedText type="title" style={styles.progressTitle}>
              {screenStep === 'syncing_identity'
                ? 'Registering Profile...'
                : syncProgress?.phase === 'connecting'
                ? 'Connecting...'
                : syncProgress?.phase === 'handshake'
                ? 'Authenticating...'
                : syncProgress?.phase === 'sending_delta'
                ? 'Sending Updates...'
                : syncProgress?.phase === 'receiving_delta'
                ? 'Receiving Updates...'
                : syncProgress?.phase === 'merging'
                ? 'Merging Data...'
                : 'Syncing Group...'}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.progressSubtitle}>
              {screenStep === 'syncing_identity'
                ? 'Sharing your new membership with nearby devices...'
                : syncProgress
                ? `Progress: ${syncProgress.count} of ${syncProgress.total} items`
                : 'Keep both devices close and FinFlow open.'}
            </ThemedText>
          </ThemedView>
        )}

        {/* STEP 3: IDENTITY SELECTION (AFTER FIRST SYNC) */}
        {screenStep === 'identity' && (
          <View style={{ gap: Spacing.three }}>
            <View style={styles.stepHeader}>
              <ThemedText type="title" style={styles.stepTitle}>
                Welcome to &ldquo;{state.name}&rdquo;!
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.stepSubtitle}>
                Group history downloaded successfully. Choose how you want to be represented in this group:
              </ThemedText>
            </View>

            {/* Option A: Join as new */}
            <ThemedView type="backgroundElement" style={styles.identityCard}>
              <View style={styles.identityHeader}>
                <ThemedText style={styles.identityIcon}>✨</ThemedText>
                <ThemedText type="smallBold">I&rsquo;M NEW TO THIS GROUP</ThemedText>
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                Creates a new member profile using your device name &ldquo;{profileName}&rdquo;.
              </ThemedText>
              <Pressable onPress={handleJoinAsNew} style={styles.primaryBtn}>
                <ThemedText style={styles.primaryBtnText}>Join as New Member</ThemedText>
              </Pressable>
            </ThemedView>

            {/* Option B: Claim an existing ghost */}
            {unclaimedGhosts.length > 0 && (
              <ThemedView type="backgroundElement" style={styles.identityCard}>
                <View style={styles.identityHeader}>
                  <ThemedText style={styles.identityIcon}>🔗</ThemedText>
                  <ThemedText type="smallBold">I&rsquo;M ALREADY IN THIS GROUP</ThemedText>
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  Did someone already add your name to this group before you joined? Claim your profile below:
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

        {/* STEP 4: SUCCESS SUMMARY */}
        {screenStep === 'summary' && lastSummary && (
          <ThemedView type="backgroundElement" style={styles.successCard}>
            <ThemedText style={styles.successIcon}>🎉</ThemedText>
            <ThemedText type="title" style={styles.successTitle}>
              Sync Complete!
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.successSubtitle}>
              Both phones now share identical, deterministic logs and balances.
            </ThemedText>

            <View style={styles.statsBox}>
              <ThemedText style={styles.statLine}>
                ✅ {lastSummary.totalNewEvents} new log updates merged
              </ThemedText>
              {lastSummary.newExpenses > 0 && (
                <ThemedText style={styles.statLine}>
                  🧾 {lastSummary.newExpenses} new expense(s)
                </ThemedText>
              )}
              {lastSummary.newMembers > 0 && (
                <ThemedText style={styles.statLine}>
                  👥 {lastSummary.newMembers} new member(s)
                </ThemedText>
              )}
              {lastSummary.newSettlements > 0 && (
                <ThemedText style={styles.statLine}>
                  💸 {lastSummary.newSettlements} settlement(s)
                </ThemedText>
              )}
              <ThemedText style={styles.statLine}>
                👥 {state.members.length} total members in group
              </ThemedText>
              <ThemedText style={[styles.statLine, { fontWeight: '700', marginTop: 4 }]}>
                💰 Your Net Balance: {formatMoney(myNetBalance, state.currency)}
              </ThemedText>
            </View>

            <View style={styles.summaryActions}>
              <Pressable
                onPress={() => router.replace({ pathname: '/groups/[groupId]', params: { groupId } })}
                style={styles.primaryBtn}>
                <ThemedText style={styles.primaryBtnText}>Return to Group</ThemedText>
              </Pressable>

              <Pressable
                onPress={() => {
                  setScreenStep('discovery');
                  setCurrentSyncPeerId(null);
                }}
                style={styles.secondaryBtn}>
                <ThemedText style={styles.secondaryBtnText}>Sync with Another Person</ThemedText>
              </Pressable>
            </View>
          </ThemedView>
        )}
      </ScrollView>

      {/* INCOMING INVITATION PROMPT MODAL */}
      <Modal
        visible={incomingInvite !== null}
        transparent
        animationType="fade"
        onRequestClose={handleRejectInvitation}>
        <View style={styles.modalOverlay}>
          <ThemedView type="backgroundElement" style={styles.modalContent}>
            <ThemedText style={styles.modalIcon}>
              {incomingInvite?.isVerified ? '🤝' : '⚠️'}
            </ThemedText>
            <ThemedText type="title" style={styles.modalTitle}>
              {incomingInvite?.isVerified ? 'Sync Request' : 'Unverified Member'}
            </ThemedText>

            <ThemedText style={styles.modalBody}>
              {incomingInvite?.isVerified ? (
                <>Sync group data with <ThemedText style={{ fontWeight: '700' }}>{incomingInvite?.displayName}</ThemedText>?</>
              ) : (
                <><ThemedText style={{ fontWeight: '700' }}>{incomingInvite?.displayName}</ThemedText> is not verified with this group&rsquo;s security key. They may have an older version or different group key.</>
              )}
            </ThemedText>

            <View style={styles.modalBtnRow}>
              {incomingInvite?.isVerified ? (
                <>
                  <Pressable onPress={handleRejectInvitation} style={styles.modalDeclineBtn}>
                    <ThemedText style={styles.modalDeclineBtnText}>Decline</ThemedText>
                  </Pressable>
                  <Pressable onPress={handleAcceptInvitation} style={styles.modalAcceptBtn}>
                    <ThemedText style={styles.modalAcceptBtnText}>Accept</ThemedText>
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable onPress={handleRejectInvitation} style={styles.modalRejectBtn}>
                    <ThemedText style={styles.modalRejectBtnText}>Reject</ThemedText>
                  </Pressable>
                  <Pressable onPress={handleAcceptInvitation} style={styles.modalAcceptAnywayBtn}>
                    <ThemedText style={styles.modalAcceptAnywayBtnText}>Accept Anyway</ThemedText>
                  </Pressable>
                </>
              )}
            </View>
          </ThemedView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
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
  firstSyncBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: 14,
    gap: Spacing.three,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    marginBottom: Spacing.two,
  },
  firstSyncBannerIcon: {
    fontSize: 28,
  },
  errorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 12,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    marginBottom: Spacing.three,
    gap: 8,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '500',
  },
  errorRetryBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  errorRetryText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '700',
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
  discoveryStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  emptyPeersCard: {
    padding: Spacing.five,
    borderRadius: 16,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(150, 150, 150, 0.15)',
  },
  emptyPeersIcon: {
    fontSize: 36,
    marginBottom: 4,
  },
  emptyPeersSubtitle: {
    textAlign: 'center',
    lineHeight: 18,
  },
  peersList: {
    gap: Spacing.two,
  },
  peerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: 14,
    gap: Spacing.three,
    borderWidth: 1,
    borderColor: 'rgba(150, 150, 150, 0.15)',
  },
  peerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  peerAvatarText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  peerInfo: {
    flex: 1,
    gap: 2,
  },
  peerName: {
    fontSize: 16,
    fontWeight: '700',
  },
  syncActionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#3b82f6',
  },
  btnPressed: {
    opacity: 0.7,
  },
  syncActionBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  troubleCard: {
    flexDirection: 'row',
    padding: Spacing.three,
    borderRadius: 14,
    gap: Spacing.three,
    borderWidth: 1,
    borderColor: 'rgba(234, 179, 8, 0.3)',
    marginTop: Spacing.two,
  },
  troubleIcon: {
    fontSize: 24,
  },
  troubleActions: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: 6,
  },
  settingsLinkBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#eab308',
  },
  settingsLinkText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '700',
  },
  retryBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(150, 150, 150, 0.3)',
  },
  retryBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  progressCard: {
    padding: Spacing.five,
    borderRadius: 20,
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
  progressTitle: {
    fontSize: 22,
    fontWeight: '800',
    marginTop: 8,
  },
  progressSubtitle: {
    textAlign: 'center',
    lineHeight: 18,
  },
  identityCard: {
    padding: Spacing.four,
    borderRadius: 16,
    gap: Spacing.two,
  },
  identityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  identityIcon: {
    fontSize: 20,
  },
  ghostList: {
    gap: Spacing.two,
    marginTop: 4,
  },
  ghostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(150, 150, 150, 0.1)',
  },
  ghostName: {
    fontSize: 15,
    fontWeight: '600',
  },
  claimGhostBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#3b82f6',
  },
  claimGhostBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
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
  summaryActions: {
    width: '100%',
    gap: Spacing.two,
  },
  primaryBtn: {
    width: '100%',
    height: 48,
    backgroundColor: '#10b981',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryBtn: {
    width: '100%',
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(150, 150, 150, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  modalContent: {
    width: '100%',
    maxWidth: 380,
    padding: Spacing.four,
    borderRadius: 18,
    alignItems: 'center',
    gap: Spacing.two,
  },
  modalIcon: {
    fontSize: 40,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  modalBody: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 6,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    width: '100%',
  },
  modalDeclineBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(150, 150, 150, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalDeclineBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalAcceptBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalAcceptBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  modalRejectBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalRejectBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  modalAcceptAnywayBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(150, 150, 150, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalAcceptAnywayBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  unsupportedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.five,
    gap: Spacing.two,
  },
  unsupportedIcon: {
    fontSize: 60,
  },
  unsupportedTitle: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  unsupportedSubtitle: {
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: Spacing.three,
  },
});
