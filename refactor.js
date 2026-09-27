const fs = require('fs');

function refactorSettings() {
  let content = fs.readFileSync('src/app/settings.tsx', 'utf8');

  content = content.replace(/import \{[\s\S]*?\} from 'react-native';/, "import { Animated, Dimensions, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';");
  content = content.replace(/import \{ useTheme \} from '@\/hooks\/use-theme';/, "import { useTheme } from '@/hooks/use-theme';\nimport { useRouter } from 'expo-router';\nimport { useEffect } from 'react';\nimport { loadAppSettings, saveAppSettings, clearAllTransactions } from '@/services/storage';\nimport { DEFAULT_APP_SETTINGS } from '@/types/finance';");

  content = content.replace(/interface AppSettingsModalProps.*?\}[\s\S]*?export function AppSettingsModal\([^)]+\) \{/s, "export default function SettingsScreen() {");

  content = content.replace(/const insets = useSafeAreaInsets\(\);/, 'const insets = useSafeAreaInsets();\n  const router = useRouter();\n  const [settings, setSettings] = useState(DEFAULT_APP_SETTINGS);\n\n  useEffect(() => {\n    loadAppSettings().then(setSettings);\n  }, []);');

  content = content.replace(/onClose\(\)/g, 'router.back()');
  content = content.replace(/onClose/g, 'router.back');
  content = content.replace(/onUpdateSettings\(updated\);/g, 'setSettings(updated);');
  content = content.replace(/onClearAllData\(\);/g, 'await clearAllTransactions();');

  content = content.replace(/<Modal[^>]*>/, '<View style={{ flex: 1, backgroundColor: theme.background }}>');
  content = content.replace(/<\/Modal>/, '</View>');

  fs.writeFileSync('src/app/settings.tsx', content);
}

function refactorAutomations() {
  let content = fs.readFileSync('src/app/automations.tsx', 'utf8');

  content = content.replace(/import \{[\s\S]*?\} from 'react-native';/, "import { Animated, ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';");
  content = content.replace(/import \{ useTheme \} from '@\/hooks\/use-theme';/, "import { useTheme } from '@/hooks/use-theme';\nimport { useRouter } from 'expo-router';\nimport { useEffect } from 'react';\nimport { loadAutomationConfig } from '@/services/storage';\nimport { DEFAULT_AUTOMATION_CONFIG } from '@/types/finance';");

  content = content.replace(/interface AutomationsModalProps.*?\}[\s\S]*?export function AutomationsModal\([^)]+\) \{/s, "export default function AutomationsScreen() {");

  content = content.replace(/const insets = useSafeAreaInsets\(\);/, 'const insets = useSafeAreaInsets();\n  const router = useRouter();\n  const [config, setConfig] = useState(DEFAULT_AUTOMATION_CONFIG);\n\n  useEffect(() => {\n    loadAutomationConfig().then(setConfig);\n  }, []);');

  content = content.replace(/onClose\(\)/g, 'router.back()');
  content = content.replace(/onClose/g, 'router.back');
  content = content.replace(/onUpdateConfig\(updated\);/g, 'setConfig(updated);');

  content = content.replace(/<Modal[^>]*>/, '<View style={{ flex: 1, backgroundColor: theme.background }}>');
  content = content.replace(/<\/Modal>/, '</View>');

  // Also remove existingTransactions stuff
  content = content.replace(/existingTransactions/g, '[]');
  content = content.replace(/onTransactionsImported/g, '() => {}');

  fs.writeFileSync('src/app/automations.tsx', content);
}

function refactorAgreement() {
  let content = fs.readFileSync('src/app/agreement.tsx', 'utf8');

  content = content.replace(/import \{[\s\S]*?\} from 'react-native';/, "import { Pressable, ScrollView, StyleSheet, View } from 'react-native';");
  content = content.replace(/import \{ useTheme \} from '@\/hooks\/use-theme';/, "import { useTheme } from '@/hooks/use-theme';\nimport { useRouter } from 'expo-router';");

  content = content.replace(/interface AgreementModalProps.*?\}[\s\S]*?export function AgreementModal\([^)]+\) \{/s, "export default function AgreementScreen() {");

  content = content.replace(/const insets = useSafeAreaInsets\(\);/, 'const insets = useSafeAreaInsets();\n  const router = useRouter();');

  content = content.replace(/onClose\(\)/g, 'router.back()');
  content = content.replace(/onClose/g, 'router.back');

  content = content.replace(/<Modal[^>]*>/, '<View style={{ flex: 1, backgroundColor: theme.background }}>');
  content = content.replace(/<\/Modal>/, '</View>');

  fs.writeFileSync('src/app/agreement.tsx', content);
}

refactorSettings();
refactorAutomations();
refactorAgreement();
