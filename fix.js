const fs = require('fs');

// Fix automations.tsx
let content = fs.readFileSync('src/app/automations.tsx', 'utf8');
content = content.replace("import { DEFAULT_AUTOMATION_CONFIG } from '@/types/finance';", "const DEFAULT_AUTOMATION_CONFIG = { isEnabled: true, fileUri: null };");
fs.writeFileSync('src/app/automations.tsx', content);

// Fix settings.tsx
content = fs.readFileSync('src/app/settings.tsx', 'utf8');
content = content.replace("import { DEFAULT_APP_SETTINGS } from '@/types/finance';", "\nconst DEFAULT_APP_SETTINGS = { currency: 'USD', enableHaptics: true, autoSync: true, syncInterval: 2500 };\nconst CURRENCIES = [\n  { symbol: '$', label: 'USD ($)' },\n  { symbol: 'LKR', label: 'LKR (Rs)' },\n  { symbol: '₹', label: 'INR (₹)' },\n  { symbol: '€', label: 'EUR (€)' },\n  { symbol: '£', label: 'GBP (£)' },\n  { symbol: '¥', label: 'JPY (¥)' },\n];");
content = content.replace("import { loadAppSettings, saveAppSettings } from '@/services/storage';\n", "");
content = content.replace(/const executeClear = \(\) => \{/g, "const executeClear = async () => {");
fs.writeFileSync('src/app/settings.tsx', content);
