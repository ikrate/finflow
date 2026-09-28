import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppSettings, AutomationConfig, Category, Transaction } from '@/types/finance';

const STORAGE_KEY = '@finflow_transactions_v1';

export async function loadTransactions(): Promise<Transaction[]> {
  try {
    const json = await AsyncStorage.getItem(STORAGE_KEY);
    if (json != null) {
      return JSON.parse(json);
    }
    return [];
  } catch (error) {
    console.warn('Failed to load transactions', error);
    return [];
  }
}

export async function saveTransactions(transactions: Transaction[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  } catch (error) {
    console.warn('Failed to save transactions', error);
  }
}

export async function clearAllTransactions(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([]));
  } catch (error) {
    console.warn('Failed to clear transactions', error);
  }
}

const AUTOMATION_KEY = '@finflow_automation_config_v1';

export const DEFAULT_AUTOMATION_CONFIG: AutomationConfig = {
  fileUri: null,
  fileName: null,
  autoSyncEnabled: true,
  lastSyncedAt: null,
  lastSyncCount: 0,
};

export async function loadAutomationConfig(): Promise<AutomationConfig> {
  try {
    const json = await AsyncStorage.getItem(AUTOMATION_KEY);
    if (json != null) {
      return { ...DEFAULT_AUTOMATION_CONFIG, ...JSON.parse(json) };
    }
  } catch (err) {
    console.warn('Failed to load automation config', err);
  }
  return DEFAULT_AUTOMATION_CONFIG;
}

export async function saveAutomationConfig(config: AutomationConfig): Promise<void> {
  try {
    await AsyncStorage.setItem(AUTOMATION_KEY, JSON.stringify(config));
  } catch (err) {
    console.warn('Failed to save automation config', err);
  }
}

const SETTINGS_KEY = '@finflow_app_settings_v1';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  currency: '$',
  enableHaptics: true,
  vendorCategories: {},
};

export async function loadAppSettings(): Promise<AppSettings> {
  try {
    const json = await AsyncStorage.getItem(SETTINGS_KEY);
    if (json != null) {
      return { ...DEFAULT_APP_SETTINGS, ...JSON.parse(json) };
    }
  } catch (err) {
    console.warn('Failed to load app settings', err);
  }
  return DEFAULT_APP_SETTINGS;
}

export async function saveAppSettings(settings: AppSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (err) {
    console.warn('Failed to save app settings', err);
  }
}

export async function saveVendorCategory(vendor: string, category: Category): Promise<AppSettings> {
  const current = await loadAppSettings();
  const trimmed = vendor.trim();
  if (!trimmed) return current;

  const updated: AppSettings = {
    ...current,
    vendorCategories: {
      ...(current.vendorCategories || {}),
      [trimmed]: category,
    },
  };
  await saveAppSettings(updated);
  return updated;
}

export async function deleteVendorCategory(vendor: string): Promise<AppSettings> {
  const current = await loadAppSettings();
  const trimmed = vendor.trim();
  if (!current.vendorCategories || !trimmed) return current;

  const copy = { ...current.vendorCategories };
  delete copy[trimmed];

  const updated: AppSettings = {
    ...current,
    vendorCategories: copy,
  };
  await saveAppSettings(updated);
  return updated;
}


