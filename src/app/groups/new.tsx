import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createGroupEvent } from '@/services/groups/eventLog';
import {
  getOrCreateDeviceId,
  saveGroupEvents,
  upsertGroupMeta,
} from '@/services/groups/storage';
import { GroupMeta, GroupType } from '@/services/groups/types';
import { generateUUID } from '@/services/groups/uuid';
import { loadAppSettings, saveAppSettings } from '@/services/storage';
import { CURRENCIES } from '@/types/finance';

const GROUP_TYPES: { key: GroupType; label: string; icon: string; desc: string }[] = [
  { key: 'trip', label: 'Trip', icon: '✈️', desc: 'Vacation, road trip, travel' },
  { key: 'event', label: 'Event', icon: '🎉', desc: 'Party, dinner, wedding, outing' },
  { key: 'household', label: 'Household', icon: '🏠', desc: 'Roommates, rent, recurring utilities' },
  { key: 'other', label: 'Other', icon: '👥', desc: 'Projects, shared purchases' },
];

export default function CreateGroupScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useTheme();

  const [groupName, setGroupName] = useState('');
  const [groupType, setGroupType] = useState<GroupType>('trip');
  const [currency, setCurrency] = useState('$');
  const [myName, setMyName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadAppSettings().then((settings) => {
      if (settings.currency) setCurrency(settings.currency);
      if (settings.profileName) setMyName(settings.profileName);
    });
  }, []);

  const handleCreate = async () => {
    const trimmedGroupName = groupName.trim();
    const trimmedMyName = myName.trim();

    if (!trimmedGroupName) {
      setError('Please enter a group name');
      return;
    }
    if (!trimmedMyName) {
      setError('Please enter your name');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      const deviceId = await getOrCreateDeviceId();
      const settings = await loadAppSettings();
      if (trimmedMyName !== settings.profileName) {
        await saveAppSettings({ ...settings, profileName: trimmedMyName });
      }

      const groupId = generateUUID();
      const myMemberId = generateUUID();
      const createdAt = Date.now();

      // Create initial events
      const e1 = createGroupEvent(
        groupId,
        deviceId,
        'group_created',
        { name: trimmedGroupName, type: groupType, currency },
        []
      );

      const e2 = createGroupEvent(
        groupId,
        deviceId,
        'member_added',
        {
          member: {
            id: myMemberId,
            name: trimmedMyName,
            kind: 'device',
            claimedByDeviceId: deviceId,
          },
        },
        [e1]
      );

      const initialEvents = [e1, e2];
      await saveGroupEvents(groupId, initialEvents, true);

      const meta: GroupMeta = {
        id: groupId,
        name: trimmedGroupName,
        type: groupType,
        currency,
        createdAt,
        myMemberId,
        status: 'open',
      };
      await upsertGroupMeta(meta);

      router.replace({ pathname: '/groups/[groupId]', params: { groupId } });
    } catch (err) {
      console.warn('Failed to create group', err);
      setError('Failed to create group. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
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
            <ThemedText style={styles.backText}>Cancel</ThemedText>
          </Pressable>

          <ThemedText style={styles.navBarTitle} numberOfLines={1}>
            New Group
          </ThemedText>

          <View style={styles.navBarRightPlaceholder} />
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, Spacing.four) + 40 },
          ]}
          keyboardShouldPersistTaps="handled">
          <ThemedText type="title" style={styles.headerTitle}>
            Create a Group
          </ThemedText>

          {/* Group Name & My Name Card */}
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.fieldLabel}>
              GROUP NAME
            </ThemedText>
            <TextInput
              value={groupName}
              onChangeText={(t) => {
                setGroupName(t);
                if (error) setError('');
              }}
              placeholder="e.g. Summer Roadtrip, Apartment 4B"
              placeholderTextColor="#94a3b8"
              maxLength={60}
              style={[
                styles.input,
                { color: theme.text, backgroundColor: theme.background, borderColor: 'rgba(150, 150, 150, 0.25)' },
              ]}
            />

            <ThemedText type="smallBold" themeColor="textSecondary" style={[styles.fieldLabel, { marginTop: Spacing.two }]}>
              YOUR NAME IN THIS GROUP
            </ThemedText>
            <TextInput
              value={myName}
              onChangeText={(t) => {
                setMyName(t);
                if (error) setError('');
              }}
              placeholder="e.g. Alex"
              placeholderTextColor="#94a3b8"
              maxLength={30}
              style={[
                styles.input,
                { color: theme.text, backgroundColor: theme.background, borderColor: 'rgba(150, 150, 150, 0.25)' },
              ]}
            />
          </ThemedView>

          {/* Group Type Selector */}
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.fieldLabel}>
              GROUP TYPE
            </ThemedText>
            <View style={styles.typeList}>
              {GROUP_TYPES.map((gt) => {
                const isSelected = groupType === gt.key;
                return (
                  <Pressable
                    key={gt.key}
                    onPress={() => setGroupType(gt.key)}
                    style={[
                      styles.typeItem,
                      isSelected && styles.typeItemSelected,
                      { backgroundColor: theme.background },
                    ]}>
                    <ThemedText style={styles.typeIcon}>{gt.icon}</ThemedText>
                    <View style={styles.typeTextGroup}>
                      <ThemedText style={[styles.typeLabel, isSelected && styles.typeLabelSelected]}>
                        {gt.label}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {gt.desc}
                      </ThemedText>
                    </View>
                    <View style={[styles.radioCircle, isSelected && styles.radioCircleSelected]}>
                      {isSelected && <View style={styles.radioInner} />}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </ThemedView>

          {/* Currency Selector */}
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.fieldLabel}>
              GROUP CURRENCY
            </ThemedText>
            <View style={styles.currencyGrid}>
              {CURRENCIES.map((c) => {
                const isSelected = currency === c.symbol;
                return (
                  <Pressable
                    key={c.symbol}
                    onPress={() => setCurrency(c.symbol)}
                    style={[
                      styles.currencyChip,
                      isSelected && styles.currencyChipSelected,
                      { backgroundColor: isSelected ? '#3b82f6' : theme.background },
                    ]}>
                    <ThemedText style={[styles.currencyText, isSelected && styles.currencyTextSelected]}>
                      {c.label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </ThemedView>

          {error ? <ThemedText style={styles.errorText}>{error}</ThemedText> : null}

          {/* Create Button */}
          <Pressable
            onPress={handleCreate}
            disabled={isSubmitting || !groupName.trim() || !myName.trim()}
            style={({ pressed }) => [
              styles.createBtn,
              (!groupName.trim() || !myName.trim() || isSubmitting) && styles.createBtnDisabled,
              pressed && { opacity: 0.8 },
            ]}>
            <ThemedText style={styles.createBtnText}>
              {isSubmitting ? 'Creating...' : 'Create Group'}
            </ThemedText>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
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
    gap: Spacing.three,
    paddingTop: Spacing.two,
    paddingHorizontal: Spacing.four,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
  },
  card: {
    padding: Spacing.three,
    borderRadius: 16,
    gap: Spacing.two,
  },
  fieldLabel: {
    fontSize: 12,
    letterSpacing: 0.5,
  },
  input: {
    height: 46,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  typeList: {
    gap: Spacing.two,
  },
  typeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: 12,
    gap: Spacing.two,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  typeItemSelected: {
    borderColor: '#3b82f6',
  },
  typeIcon: {
    fontSize: 24,
  },
  typeTextGroup: {
    flex: 1,
    gap: 2,
  },
  typeLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  typeLabelSelected: {
    color: '#3b82f6',
    fontWeight: '700',
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#94a3b8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioCircleSelected: {
    borderColor: '#3b82f6',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#3b82f6',
  },
  currencyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  currencyChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(150, 150, 150, 0.25)',
  },
  currencyChipSelected: {
    borderColor: 'transparent',
  },
  currencyText: {
    fontSize: 14,
    fontWeight: '600',
  },
  currencyTextSelected: {
    color: '#ffffff',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    textAlign: 'center',
  },
  createBtn: {
    height: 50,
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  createBtnDisabled: {
    opacity: 0.4,
  },
  createBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
