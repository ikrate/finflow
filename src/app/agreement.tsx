import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useRouter } from 'expo-router';

export default function AgreementScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
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
              onPress={router.back}
              style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}>
              <ThemedText style={styles.backChevron}>‹</ThemedText>
              <ThemedText style={styles.backText}>Back</ThemedText>
            </Pressable>

            <ThemedText style={styles.navBarTitle} numberOfLines={1}>
              Agreement
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
              Agreement & Privacy
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.pageSubtitle}>
              Terms of service, privacy guarantee & data ownership
            </ThemedText>
          </View>
            {/* Privacy Guarantee Card */}
            <ThemedView type="backgroundElement" style={styles.highlightCard}>
              <ThemedText style={styles.badgeIcon}>🛡️</ThemedText>
              <View style={styles.highlightContent}>
                <ThemedText type="smallBold" style={styles.highlightTitle}>
                  100% On-Device Privacy Commitment
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.highlightDesc}>
                  FinFlow does not use external servers, cloud databases, analytics, or third-party trackers. All financial figures, SMS text logs, and files remain strictly inside your device's local sandbox.
                </ThemedText>
              </View>
            </ThemedView>

            {/* Section 1: Data Ownership */}
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">1. DATA OWNERSHIP & STORAGE</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.paragraph}>
                You retain complete, exclusive ownership of all data entered into or synced with FinFlow. Your transaction history is stored locally in your device's isolated storage using encrypted AsyncStorage and iOS Sandboxed file directories. We have zero access to your finances.
              </ThemedText>
            </ThemedView>

            {/* Section 2: SMS & File Automations */}
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">2. AUTOMATION & FILE SYNC</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.paragraph}>
                When you configure Apple Shortcuts to capture banking SMS or Apple Pay events, transactions are appended to a local file (such as <ThemedText type="code">pending.csv</ThemedText>). FinFlow reads this file entirely offline, parses amounts with on-device algorithms, and permanently deletes temporary pending queues.
              </ThemedText>
            </ThemedView>

            {/* Section 3: Disclaimer & Financial Guidance */}
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">3. FINANCIAL DISCLAIMER</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.paragraph}>
                FinFlow is a personal expense tracking tool and does not provide financial, investment, legal, or tax advice. While our intelligent transaction parser is designed for high accuracy across global banking formats, you should periodically review logged amounts against official bank statements.
              </ThemedText>
            </ThemedView>

            {/* Close Button */}
            <Pressable
              onPress={router.back}
              style={({ pressed }) => [styles.btnDone, pressed && styles.btnPressed]}>
              <ThemedText style={styles.btnDoneText}>I Understand & Agree</ThemedText>
            </Pressable>
        </ScrollView>
      </View>
    </View>
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
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    fontSize: 14,
    lineHeight: 19,
  },
  highlightCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderWidth: 1,
  },
  badgeIcon: {
    fontSize: 28,
  },
  highlightContent: {
    flex: 1,
    gap: 4,
  },
  highlightTitle: {
    color: '#10b981',
    fontSize: 14,
  },
  highlightDesc: {
    lineHeight: 18,
  },
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  paragraph: {
    lineHeight: 20,
  },
  btnDone: {
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.one,
  },
  btnDoneText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  btnPressed: {
    opacity: 0.8,
  },
});
