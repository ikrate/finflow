import React from 'react';
import {
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

export default function AutomationsScreen() {
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
              Automations
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.pageSubtitle}>
              Automatic ingestion for transactions recorded by iOS Shortcuts or SMS
            </ThemedText>
          </View>

          {/* Section: iOS Shortcut Setup Guide */}
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
                ✅ Recommended: App Intent
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Send text directly to FinFlow in the background using the FinFlow shortcut intent:
              </ThemedText>
              <View style={styles.codeSnippet}>
                <ThemedText type="code" style={styles.codeText}>
                  1. Trigger: When I receive a message{'\n'}
                  {'   '}Sender contains: your bank number{'\n'}
                  2. Action: Send to FinFlow{'\n'}
                  {'   '}Input: [Shortcut Input]
                </ThemedText>
              </View>
            </View>

            <ThemedText type="small" themeColor="textSecondary" style={styles.infoText}>
              💡 <ThemedText style={{ fontWeight: '700' }}>How it works:</ThemedText> FinFlow receives input securely in the background, parses it, and automatically syncs it immediately when opened.
            </ThemedText>
          </ThemedView>
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
    fontSize: 24,
    fontWeight: '700',
  },
  pageSubtitle: {
    lineHeight: 18,
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardIcon: {
    fontSize: 18,
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
});
