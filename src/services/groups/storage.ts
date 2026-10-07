import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadAppSettings, saveAppSettings } from '../storage';
import { deriveGroupState } from './eventLog';
import { DerivedGroupState, GroupEvent, GroupMeta } from './types';
import { generateUUID } from './uuid';

const GROUPS_INDEX_KEY = '@finflow_groups_index_v1';
const GROUP_EVENTS_KEY_PREFIX = '@finflow_group_events_v1_';
const GROUP_VV_KEY_PREFIX = '@finflow_group_vv_v1_';

// In-memory write debounce timers per group
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Returns the persistent deviceId, creating and saving one if it does not exist.
 */
export async function getOrCreateDeviceId(): Promise<string> {
  const settings = await loadAppSettings();
  if (settings.deviceId && settings.deviceId.trim().length > 0) {
    return settings.deviceId;
  }
  const newDeviceId = generateUUID();
  await saveAppSettings({ ...settings, deviceId: newDeviceId });
  return newDeviceId;
}

/**
 * Loads the list of all groups from storage.
 */
export async function loadGroupsIndex(): Promise<GroupMeta[]> {
  try {
    const raw = await AsyncStorage.getItem(GROUPS_INDEX_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('Failed to load groups index', err);
  }
  return [];
}

/**
 * Saves the list of all groups to storage.
 */
export async function saveGroupsIndex(index: GroupMeta[]): Promise<void> {
  try {
    await AsyncStorage.setItem(GROUPS_INDEX_KEY, JSON.stringify(index));
  } catch (err) {
    console.warn('Failed to save groups index', err);
  }
}

/**
 * Loads events for a specific group.
 */
export async function loadGroupEvents(groupId: string): Promise<GroupEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(`${GROUP_EVENTS_KEY_PREFIX}${groupId}`);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn(`Failed to load events for group ${groupId}`, err);
  }
  return [];
}

/**
 * Saves events for a specific group with debouncing.
 */
export async function saveGroupEvents(
  groupId: string,
  events: GroupEvent[],
  immediate = false
): Promise<void> {
  const executeSave = async () => {
    try {
      await AsyncStorage.setItem(`${GROUP_EVENTS_KEY_PREFIX}${groupId}`, JSON.stringify(events));
    } catch (err) {
      console.warn(`Failed to save events for group ${groupId}`, err);
    }
  };

  if (immediate) {
    const existingTimer = debounceTimers.get(groupId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      debounceTimers.delete(groupId);
    }
    await executeSave();
    return;
  }

  const existingTimer = debounceTimers.get(groupId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  return new Promise((resolve) => {
    const timer = setTimeout(async () => {
      debounceTimers.delete(groupId);
      await executeSave();
      resolve();
    }, 250);
    debounceTimers.set(groupId, timer);
  });
}

/**
 * Retrieves the derived group state and metadata.
 */
export async function getDerivedGroup(groupId: string): Promise<{
  state: DerivedGroupState;
  meta: GroupMeta | null;
  events: GroupEvent[];
}> {
  const [index, events] = await Promise.all([loadGroupsIndex(), loadGroupEvents(groupId)]);
  const state = deriveGroupState(groupId, events);
  const meta = index.find((g) => g.id === groupId) || null;
  return { state, meta, events };
}

/**
 * Updates or creates a GroupMeta in the index.
 */
export async function upsertGroupMeta(meta: GroupMeta): Promise<void> {
  const index = await loadGroupsIndex();
  const existingIdx = index.findIndex((g) => g.id === meta.id);
  if (existingIdx >= 0) {
    index[existingIdx] = { ...index[existingIdx], ...meta };
  } else {
    index.push(meta);
  }
  await saveGroupsIndex(index);
}

/**
 * Ensures that a group has a 32-byte groupKey.
 * If missing (e.g. created prior to the update), generates one, emits a group_key_set event,
 * updates GroupMeta in the index, and saves immediately.
 */
export async function ensureGroupKey(groupId: string): Promise<string> {
  const [index, events] = await Promise.all([loadGroupsIndex(), loadGroupEvents(groupId)]);
  const state = deriveGroupState(groupId, events);
  if (state.groupKey) {
    const meta = index.find((g) => g.id === groupId);
    if (meta && !meta.groupKey) {
      meta.groupKey = state.groupKey;
      await upsertGroupMeta(meta);
    }
    return state.groupKey;
  }

  const { generateGroupKey } = await import('./sync/auth');
  const { createGroupEvent } = await import('./eventLog');

  const newKey = generateGroupKey();
  const deviceId = await getOrCreateDeviceId();
  const keyEvent = createGroupEvent(groupId, deviceId, 'group_key_set', { key: newKey }, events);
  events.push(keyEvent);
  await saveGroupEvents(groupId, events, true);

  const meta = index.find((g) => g.id === groupId);
  if (meta) {
    meta.groupKey = newKey;
    await upsertGroupMeta(meta);
  }

  return newKey;
}

/**
 * Completely clears all groups and events from AsyncStorage.
 */
export async function wipeAllGroupData(): Promise<void> {
  try {
    const index = await loadGroupsIndex();
    const keysToRemove = [GROUPS_INDEX_KEY];

    for (const group of index) {
      keysToRemove.push(`${GROUP_EVENTS_KEY_PREFIX}${group.id}`);
      keysToRemove.push(`${GROUP_VV_KEY_PREFIX}${group.id}`);
    }

    // Also look up any other matching keys in AsyncStorage
    const allKeys = await AsyncStorage.getAllKeys();
    const groupKeys = allKeys.filter(
      (k) =>
        k === GROUPS_INDEX_KEY ||
        k.startsWith(GROUP_EVENTS_KEY_PREFIX) ||
        k.startsWith(GROUP_VV_KEY_PREFIX)
    );

    const mergedKeys = Array.from(new Set([...keysToRemove, ...groupKeys]));
    await AsyncStorage.multiRemove(mergedKeys);
  } catch (err) {
    console.warn('Failed to wipe group data', err);
  }
}

/**
 * Updates profileName in AppSettings and emits member_renamed in each group the user is in.
 */
export async function updateProfileNameAcrossGroups(newName: string): Promise<void> {
  const trimmed = newName.trim();
  if (!trimmed) return;

  const settings = await loadAppSettings();
  const deviceId = await getOrCreateDeviceId();
  await saveAppSettings({ ...settings, profileName: trimmed, deviceId });

  const index = await loadGroupsIndex();
  const { createGroupEvent } = await import('./eventLog');

  for (const group of index) {
    if (group.myMemberId) {
      try {
        const events = await loadGroupEvents(group.id);
        const renameEvent = createGroupEvent(
          group.id,
          deviceId,
          'member_renamed',
          { memberId: group.myMemberId, name: trimmed },
          events
        );
        events.push(renameEvent);
        await saveGroupEvents(group.id, events, true);
      } catch (err) {
        console.warn(`Failed to rename member in group ${group.id}`, err);
      }
    }
  }
}
