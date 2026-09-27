import { NativeModule, requireNativeModule } from 'expo-modules-core';

export type ShortcutRecord = {
  id: string;
  text: string;
  amount?: number;
  category?: string;
  timestamp: string;
  source: 'shortcut';
};

declare class FinflowIntentsModule extends NativeModule<{}> {
  getRecords(): Promise<ShortcutRecord[]>;
  clearRecords(): Promise<void>;
  deleteRecord(id: string): Promise<void>;
}

let module: FinflowIntentsModule | null = null;
try {
  module = requireNativeModule<FinflowIntentsModule>('FinflowIntents');
} catch (e) {
  console.warn('FinflowIntents native module not found. It will not work in Expo Go without a custom dev client.');
}

export default module;
