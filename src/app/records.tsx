import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, FlatList, Pressable, ActivityIndicator, Alert } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';

import FinflowIntentsModule, { ShortcutRecord } from '../../modules/finflow-intents/src/FinflowIntentsModule';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Spacing, MaxContentWidth } from '@/constants/theme';
import { useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/use-theme';

export default function RecordsScreen() {
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const router = useRouter();
  const [records, setRecords] = useState<ShortcutRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRecords = useCallback(async () => {
    try {
      setLoading(true);
      if (FinflowIntentsModule && FinflowIntentsModule.getRecords) {
        const data = await FinflowIntentsModule.getRecords();
        setRecords(data.reverse()); // Show newest first
      } else {
        setRecords([]);
      }
    } catch (err) {
      console.warn('Failed to load shortcut records:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadRecords();
    }, [loadRecords])
  );

  const handleDelete = async (id: string) => {
    try {
      if (FinflowIntentsModule && FinflowIntentsModule.deleteRecord) {
        await FinflowIntentsModule.deleteRecord(id);
      }
      loadRecords();
    } catch (err) {
      Alert.alert('Error', 'Failed to delete record.');
    }
  };

  const handleClearAll = () => {
    Alert.alert('Clear All', 'Are you sure you want to delete all shortcut records?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete All',
        style: 'destructive',
        onPress: async () => {
          try {
            if (FinflowIntentsModule && FinflowIntentsModule.clearRecords) {
              await FinflowIntentsModule.clearRecords();
            }
            loadRecords();
          } catch (err) {
            Alert.alert('Error', 'Failed to clear records.');
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: ShortcutRecord }) => {
    return (
      <View style={[styles.recordCard, isDark ? styles.cardDark : styles.cardLight]}>
        <View style={styles.recordHeader}>
          <ThemedText style={styles.recordId} numberOfLines={1}>
            {item.id}
          </ThemedText>
          <ThemedText style={styles.sourceBadge}>{item.source}</ThemedText>
        </View>

        <View style={styles.recordBody}>
          <ThemedText style={styles.textLabel}>Text: {item.text}</ThemedText>
          {item.amount !== undefined && (
            <ThemedText style={styles.detailLabel}>Amount: {item.amount}</ThemedText>
          )}
          {item.category && (
            <ThemedText style={styles.detailLabel}>Category: {item.category}</ThemedText>
          )}
          <ThemedText style={styles.detailLabel}>
            Time: {new Date(item.timestamp).toLocaleString()}
          </ThemedText>
        </View>

        <Pressable style={styles.deleteBtn} onPress={() => handleDelete(item.id)}>
          <ThemedText style={styles.deleteBtnText}>Delete</ThemedText>
        </Pressable>
      </View>
    );
  };

  return (
    <ThemedView style={[styles.container, { backgroundColor: theme.background }]}>
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
            Shortcut Records
          </ThemedText>

          <View style={styles.navBarRightPlaceholder} />
        </View>
      </View>
      {loading && records.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      ) : records.length === 0 ? (
        <View style={styles.center}>
          <ThemedText themeColor="textSecondary">No records received from Shortcuts.</ThemedText>
        </View>
      ) : (
        <FlatList
          data={records}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          onRefresh={loadRecords}
          refreshing={loading}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  navBar: {
    width: '100%',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(150, 150, 150, 0.1)',
  },
  navBarContent: {
    width: '100%',
    maxWidth: MaxContentWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backBtnPressed: {
    opacity: 0.5,
  },
  backChevron: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '300',
    color: '#3b82f6',
    marginTop: -2,
  },
  backText: {
    fontSize: 16,
    color: '#3b82f6',
  },
  navBarTitle: {
    fontSize: 17,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  navBarRightPlaceholder: {
    width: 60,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  recordCard: {
    padding: Spacing.three,
    borderRadius: 12,
    borderWidth: 1,
  },
  cardLight: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
  },
  cardDark: {
    backgroundColor: '#1e293b',
    borderColor: '#334155',
  },
  recordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  recordId: {
    fontSize: 10,
    color: '#64748b',
    flex: 1,
    marginRight: Spacing.two,
  },
  sourceBadge: {
    fontSize: 10,
    backgroundColor: '#3b82f620',
    color: '#3b82f6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
    fontWeight: 'bold',
  },
  recordBody: {
    marginBottom: Spacing.three,
  },
  textLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  detailLabel: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 2,
  },
  deleteBtn: {
    alignSelf: 'flex-end',
    padding: 6,
  },
  deleteBtnText: {
    color: '#ef4444',
    fontWeight: '600',
  },
  headerBtn: {
    color: '#ef4444',
    fontWeight: '600',
    paddingRight: Spacing.three,
  },
});
