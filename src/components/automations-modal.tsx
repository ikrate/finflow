import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { autoSyncPendingFiles } from '@/services/file-sync';
import { saveAutomationConfig } from '@/services/storage';
import { AutomationConfig, Transaction } from '@/types/finance';

interface AutomationsModalProps {
  visible: boolean;
  onClose: () => void;
  config: AutomationConfig;
  onUpdateConfig: (newConfig: AutomationConfig) => void;
  existingTransactions: Transaction[];
  onTransactionsImported: (imported: Transaction[]) => void;
}

export function AutomationsModal({
  visible,
  onClose,
  config,
  onUpdateConfig,
  existingTransactions,
  onTransactionsImported,
}: AutomationsModalProps) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  /**
   * Manual sync test: checks documents directory.
   */
  const handleTestSync = async () => {
    try {
      setLoading(true);
      setFeedback(null);
      const syncRes = await autoSyncPendingFiles(existingTransactions);
      if (syncRes.importedCount > 0) {
        onTransactionsImported(syncRes.transactions);
        setFeedback(
          `⚡ Synced ${syncRes.importedCount} new transaction(s)! Total: ${
            existingTransactions.length + syncRes.importedCount
          }`
        );
      } else if (syncRes.totalLinesRead > 0) {
        setFeedback(
          `👌 Read ${syncRes.totalLinesRead} line(s) from pending file. All are already imported (0 duplicates).`
        );
      } else {
        setFeedback(
          `ℹ️ No pending transactions found in file (0 lines). You can append lines or link your file below.`
        );
      }
    } catch (err) {
      console.warn('Sync test error:', err);
      setFeedback('⚠️ Could not read file. Re-select the file using the button below.');
    } finally {
      setLoading(false);
    }
  };



  const handleToggleAutoSync = async (enabled: boolean) => {
    const updated: AutomationConfig = {
      ...config,
      autoSyncEnabled: enabled,
    };
    await saveAutomationConfig(updated);
    onUpdateConfig(updated);
  };

  const formatTimestamp = (ts: number | null) => {
    if (!ts) return 'Never';
    const date = new Date(ts);
    return (
      date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) +
      ', ' +
      date.toLocaleDateString()
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={onClose}>
      <View style={[styles.screen, { backgroundColor: theme.background }]}>
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
              onPress={onClose}
              style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}>
              <ThemedText style={styles.backChevron}>‹</ThemedText>
              <ThemedText style={styles.backText}>Back</ThemedText>
            </Pressable>

            <ThemedText style={styles.navBarTitle} numberOfLines={1}>
              Automations
            </ThemedText>

            <View style={styles.navBarRightPlaceholder} />
          </View>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, Spacing.four) + 36 },
          ]}
          showsVerticalScrollIndicator={false}>
          {/* Page Title Header */}
          <View style={styles.pageHeader}>
            <ThemedText type="title" style={styles.pageTitle}>
              Automations & Sync
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.pageSubtitle}>
              Continuous auto-sync for transactions recorded by iOS Shortcuts or CSV files
            </ThemedText>
          </View>

          {/* Feedback alert */}
          {feedback && (
            <View style={styles.feedbackBanner}>
              <ThemedText style={styles.feedbackText}>{feedback}</ThemedText>
            </View>
          )}

          {/* Section 1: Monitoring Status */}
          <ThemedView type="backgroundElement" style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardHeaderLeft}>
                <ThemedText style={styles.cardIcon}>📁</ThemedText>
                <ThemedText type="smallBold">MONITORING STATUS</ThemedText>
              </View>
              <View style={styles.badgeActive}>
                <ThemedText style={styles.badgeActiveText}>Active</ThemedText>
              </View>
            </View>

            <View style={styles.fileDetails}>
              <View style={styles.fileNameRow}>
                <ThemedText style={styles.fileName}>pending.csv</ThemedText>
              </View>
              <View style={styles.metaRow}>
                <ThemedText type="small" themeColor="textSecondary">
                  FinFlow is silently monitoring the local pending.csv file for new transactions.
                </ThemedText>
              </View>

              <View style={styles.buttonRow}>
                <Pressable
                  onPress={handleTestSync}
                  disabled={loading}
                  style={({ pressed }) => [styles.btnSecondary, pressed && styles.btnPressed, { flex: 1 }]}>
                  {loading ? (
                    <ActivityIndicator size="small" color="#3b82f6" />
                  ) : (
                    <ThemedText style={styles.btnSecondaryText}>⚡ Sync Now</ThemedText>
                  )}
                </Pressable>
              </View>
            </View>
          </ThemedView>

          {/* Section 2: Continuous & Background Auto-Sync */}
          <ThemedView type="backgroundElement" style={styles.card}>
            <View style={styles.switchRow}>
              <View style={styles.switchTextGroup}>
                <ThemedText type="smallBold">Continuous Auto-Sync</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Continuously checks for new lines every 2-3 seconds while the app is active, plus on cold start and warm start (when returning from recents or other apps).
                </ThemedText>
              </View>
              <Switch
                value={config.autoSyncEnabled}
                onValueChange={handleToggleAutoSync}
                trackColor={{ false: '#64748b', true: '#3b82f6' }}
                thumbColor={
                  Platform.OS === 'ios'
                    ? '#ffffff'
                    : config.autoSyncEnabled
                    ? '#ffffff'
                    : '#cbd5e1'
                }
              />
            </View>
          </ThemedView>

          {/* Section 3: Deduplication Info */}
          <ThemedView type="backgroundElement" style={styles.card}>
            <View style={styles.cardHeaderLeft}>
              <ThemedText style={styles.cardIcon}>🛡️</ThemedText>
              <ThemedText type="smallBold">DUPLICATE PROTECTION</ThemedText>
            </View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.infoText}>
              FinFlow uses cumulative occurrence-based deduplication. Even if your file contains previously loaded transactions or is re-read multiple times,{' '}
              <ThemedText style={{ fontWeight: '700' }}>zero duplicate transactions</ThemedText>{' '}
              will ever be created.
            </ThemedText>
          </ThemedView>

          {/* Section 4: iOS Shortcut Setup Guide */}
          <ThemedView type="backgroundElement" style={styles.card}>
            <View style={styles.cardHeaderLeft}>
              <ThemedText style={styles.cardIcon}>📲</ThemedText>
              <ThemedText type="smallBold">CARD SMS AUTOMATION GUIDE</ThemedText>
            </View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.infoText}>
              In Apple Shortcuts app &gt; Automation tab &gt; (+) New Automation &gt; Trigger: &quot;When I receive a message&quot;:
            </ThemedText>

            <View style={styles.guideStepBox}>
              <ThemedText type="smallBold" style={{ color: '#22c55e' }}>
                ✅ Recommended: Append to pending.csv
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                FinFlow reads from its own folder. The Shortcut must save to this exact location:
              </ThemedText>
              <View style={styles.codeSnippet}>
                <ThemedText type="code" style={styles.codeText}>
                  1. Trigger: When I receive a message{'\n'}
                  {'   '}Sender contains: your bank number{'\n'}
                  2. Action: Append to Text File{'\n'}
                  {'   '}Text: [Shortcut Input]{'\n'}
                  {'   '}File Path: /Expo Go/pending.csv{'\n'}
                  {'   '}(or /FinFlow/pending.csv for standalone){'\n'}
                  {'   '}Location: On My iPhone
                </ThemedText>
              </View>
              <ThemedText type="small" themeColor="textSecondary" style={{ fontStyle: 'italic' }}>
                💡 After import, FinFlow automatically clears the file to keep it clean!
              </ThemedText>
            </View>

            <View style={[styles.guideStepBox, { marginTop: 8 }]}>
              <ThemedText type="smallBold" style={{ color: '#3b82f6' }}>
                Alternative: Deep Link (requires app open)
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Sends the SMS text directly to FinFlow via URL scheme:
              </ThemedText>
              <View style={styles.codeSnippet}>
                <ThemedText type="code" style={styles.codeText}>
                  1. Trigger: When I receive a message{'\n'}
                  2. Action: Open URL{'\n'}
                  {'   '}URL: finflow://add?text=[Shortcut Input]
                </ThemedText>
              </View>
            </View>

            <ThemedText type="small" themeColor="textSecondary" style={styles.infoText}>
              💡 <ThemedText style={{ fontWeight: '700' }}>How it works:</ThemedText> FinFlow checks pending.csv every 2-3 seconds while open, on every warm start from recents, and periodically in the background via iOS Background Fetch.
            </ThemedText>
          </ThemedView>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
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
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.four,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  pageHeader: {
    paddingVertical: Spacing.one,
    gap: 4,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '700',
  },
  pageSubtitle: {
    lineHeight: 18,
  },
  feedbackBanner: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderLeftWidth: 4,
    borderLeftColor: '#3b82f6',
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  feedbackText: {
    color: '#3b82f6',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardIcon: {
    fontSize: 18,
  },
  badgeActive: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  badgeActiveText: {
    color: '#22c55e',
    fontSize: 11,
    fontWeight: '700',
  },
  badgeInactive: {
    backgroundColor: 'rgba(150, 150, 150, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  badgeInactiveText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  fileDetails: {
    gap: Spacing.two,
    paddingTop: Spacing.one,
  },
  fileNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fileName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#3b82f6',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaValue: {
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingTop: Spacing.two,
  },

  btnPrimary: {
    flex: 1,
    backgroundColor: '#3b82f6',
    paddingVertical: 10,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  btnSecondary: {
    flex: 1,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    paddingVertical: 10,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondaryText: {
    color: '#3b82f6',
    fontSize: 13,
    fontWeight: '700',
  },
  btnDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    paddingHorizontal: 14,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDangerText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '700',
  },
  emptyFileContent: {
    gap: Spacing.two,
    paddingTop: Spacing.one,
  },
  emptyDesc: {
    lineHeight: 20,
  },
  btnSelectFile: {
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.one,
  },
  btnSelectFileText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  switchTextGroup: {
    flex: 1,
    gap: 4,
  },
  infoText: {
    lineHeight: 20,
  },
  guideStepBox: {
    gap: 4,
  },
  codeSnippet: {
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    padding: Spacing.two,
    borderRadius: Spacing.two,
    marginVertical: 4,
  },
  codeText: {
    fontSize: 12,
    lineHeight: 18,
  },
  btnPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
});
