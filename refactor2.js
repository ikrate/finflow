const fs = require('fs');

function replaceAll(str, search, replacement) {
  return str.split(search).join(replacement);
}

function refactorSettings() {
  let content = fs.readFileSync('src/app/settings.tsx', 'utf8');

  content = content.replace(/import \{.*?Modal.*?\} from 'react-native';/, "import { Animated, Dimensions, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';");
  content = content.replace(/import \{ useTheme \} from '@\/hooks\/use-theme';/, "import { useTheme } from '@/hooks/use-theme';\nimport { useRouter } from 'expo-router';\nimport { useEffect } from 'react';\nimport { loadAppSettings, saveAppSettings, clearAllTransactions } from '@/services/storage';\nimport { DEFAULT_APP_SETTINGS } from '@/types/finance';");

  content = content.replace(/interface AppSettingsModalProps.*?\}[\s\S]*?export function AppSettingsModal\([^)]+\) \{/s, "export default function SettingsScreen() {");

  content = content.replace(/const insets = useSafeAreaInsets\(\);/, 'const insets = useSafeAreaInsets();\n  const router = useRouter();\n  const [settings, setSettings] = useState(DEFAULT_APP_SETTINGS);\n\n  useEffect(() => {\n    loadAppSettings().then(setSettings);\n  }, []);');

  content = replaceAll(content, "onClose()", "router.back()");
  content = replaceAll(content, "onClose", "router.back");
  content = replaceAll(content, "onUpdateSettings(updated)", "setSettings(updated)");
  content = replaceAll(content, "onClearAllData()", "await clearAllTransactions()");

  content = content.replace(/<Modal[^>]*>/, '<View style={{ flex: 1, backgroundColor: theme.background }}>');
  content = content.replace(/<\/Modal>/, '</View>');

  content = replaceAll(content, "const executeClear = () => {", "const executeClear = async () => {");
  
  // Clean up duplicate import
  content = content.replace(/import \{ saveAppSettings \} from '@\/services\/storage';\n/, "");

  fs.writeFileSync('src/app/settings.tsx', content);
}

function refactorAutomations() {
  let content = fs.readFileSync('src/app/automations.tsx', 'utf8');

  content = content.replace(/import \{.*?Modal.*?\} from 'react-native';/, "import { Animated, ActivityIndicator, Pressable, ScrollView, StyleSheet, View, Switch, Platform } from 'react-native';");
  content = content.replace(/import \{ useTheme \} from '@\/hooks\/use-theme';/, "import { useTheme } from '@/hooks/use-theme';\nimport { useRouter } from 'expo-router';\nimport { useEffect } from 'react';\nimport { loadAutomationConfig } from '@/services/storage';\n");

  content = content.replace(/interface AutomationsModalProps.*?\}[\s\S]*?export function AutomationsModal\([^)]+\) \{/s, "const DEFAULT_AUTOMATION_CONFIG = { isEnabled: true, fileUri: null };\nexport default function AutomationsScreen() {");

  content = content.replace(/const insets = useSafeAreaInsets\(\);/, 'const insets = useSafeAreaInsets();\n  const router = useRouter();\n  const [config, setConfig] = useState(DEFAULT_AUTOMATION_CONFIG);\n\n  useEffect(() => {\n    loadAutomationConfig().then(setConfig);\n  }, []);');

  content = replaceAll(content, "onClose()", "router.back()");
  content = replaceAll(content, "onClose", "router.back");
  content = replaceAll(content, "onUpdateConfig(updated)", "setConfig(updated)");

  content = content.replace(/<Modal[^>]*>/, '<View style={{ flex: 1, backgroundColor: theme.background }}>');
  content = content.replace(/<\/Modal>/, '</View>');

  content = replaceAll(content, "existingTransactions", "[]");
  content = replaceAll(content, "onTransactionsImported", "(() => {})");

  // Fix the syntax error from my previous naive replace
  // `onTransactionsImported(syncRes.transactions)` -> `(() => {})(syncRes.transactions)`
  
  fs.writeFileSync('src/app/automations.tsx', content);
}

function refactorAgreement() {
  let content = fs.readFileSync('src/app/agreement.tsx', 'utf8');

  content = content.replace(/import \{.*?Modal.*?\} from 'react-native';/, "import { Pressable, ScrollView, StyleSheet, View } from 'react-native';");
  content = content.replace(/import \{ useTheme \} from '@\/hooks\/use-theme';/, "import { useTheme } from '@/hooks/use-theme';\nimport { useRouter } from 'expo-router';");

  content = content.replace(/interface AgreementModalProps.*?\}[\s\S]*?export function AgreementModal\([^)]+\) \{/s, "export default function AgreementScreen() {");

  content = content.replace(/const insets = useSafeAreaInsets\(\);/, 'const insets = useSafeAreaInsets();\n  const router = useRouter();');

  content = replaceAll(content, "onClose()", "router.back()");
  content = replaceAll(content, "onClose", "router.back");

  content = content.replace(/<Modal[^>]*>/, '<View style={{ flex: 1, backgroundColor: theme.background }}>');
  content = content.replace(/<\/Modal>/, '</View>');

  fs.writeFileSync('src/app/agreement.tsx', content);
}

refactorSettings();
refactorAutomations();
refactorAgreement();
