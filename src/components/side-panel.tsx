import React, { useEffect, useRef } from 'react';
import {
  Animated,
  BackHandler,
  Dimensions,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { AutomationConfig } from '@/types/finance';

const PANEL_WIDTH = Math.min(320, Dimensions.get('window').width * 0.82);

interface SidePanelProps {
  visible: boolean;
  onClose: () => void;
  onOpen?: () => void;
  automationConfig: AutomationConfig;
}

import { useRouter } from 'expo-router';

export function SidePanel({
  visible,
  onClose,
  onOpen,
  automationConfig,
}: SidePanelProps) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const router = useRouter();
  const [isRendered, setIsRendered] = useState(visible);
  const slideAnim = useRef(new Animated.Value(-PANEL_WIDTH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const isDraggingEdge = useRef(false);

  // PanResponder for dragging left to close when drawer is open
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 10;
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dx < 0) {
          slideAnim.setValue(gestureState.dx);
          const progress = Math.max(0, 1 + gestureState.dx / PANEL_WIDTH);
          fadeAnim.setValue(progress);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < -50 || gestureState.vx < -0.5) {
          onClose();
        } else {
          // Snap back
          Animated.parallel([
            Animated.spring(slideAnim, {
              toValue: 0,
              useNativeDriver: true,
            }),
            Animated.timing(fadeAnim, {
              toValue: 1,
              duration: 150,
              useNativeDriver: true,
            }),
          ]).start();
        }
      },
    })
  ).current;

  // Edge PanResponder: swiping right from the leftmost edge opens the drawer
  const edgePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dx > 10 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.3;
      },
      onPanResponderGrant: () => {
        isDraggingEdge.current = true;
        setIsRendered(true);
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dx > 0) {
          const currentX = Math.min(0, -PANEL_WIDTH + gestureState.dx);
          slideAnim.setValue(currentX);
          const progress = Math.min(1, Math.max(0, gestureState.dx / (PANEL_WIDTH * 0.8)));
          fadeAnim.setValue(progress);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        isDraggingEdge.current = false;
        if (gestureState.dx > 60 || gestureState.vx > 0.35) {
          Animated.parallel([
            Animated.spring(slideAnim, {
              toValue: 0,
              useNativeDriver: true,
              bounciness: 0,
            }),
            Animated.timing(fadeAnim, {
              toValue: 1,
              duration: 200,
              useNativeDriver: true,
            }),
          ]).start();
          onOpen?.();
        } else {
          Animated.parallel([
            Animated.timing(slideAnim, {
              toValue: -PANEL_WIDTH,
              duration: 180,
              useNativeDriver: true,
            }),
            Animated.timing(fadeAnim, {
              toValue: 0,
              duration: 180,
              useNativeDriver: true,
            }),
          ]).start(() => {
            setIsRendered(false);
          });
        }
      },
      onPanResponderTerminate: () => {
        isDraggingEdge.current = false;
        Animated.parallel([
          Animated.timing(slideAnim, {
            toValue: -PANEL_WIDTH,
            duration: 180,
            useNativeDriver: true,
          }),
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 180,
            useNativeDriver: true,
          }),
        ]).start(() => {
          setIsRendered(false);
        });
      },
    })
  ).current;

  useEffect(() => {
    if (isDraggingEdge.current) return;

    if (visible) {
      setIsRendered(true);
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 260,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 260,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (isRendered) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -PANEL_WIDTH,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setIsRendered(false);
      });
    }
  }, [visible, isRendered, slideAnim, fadeAnim]);

  useEffect(() => {
    if (!visible) return;
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => backHandler.remove();
  }, [visible, onClose]);

  return (
    <>
      {/* Edge Swipe Detector Strip (Active when drawer is closed) */}
      {!visible && (
        <View
          style={styles.edgeDetector}
          {...edgePanResponder.panHandlers}
        />
      )}

      {/* Full Drawer & Backdrop (Rendered when open or animating) */}
      {isRendered && (
        <View style={styles.container}>
          {/* Backdrop */}
          <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          </Animated.View>

          {/* Slideable Panel */}
          <Animated.View
            {...panResponder.panHandlers}
            style={[
              styles.panel,
              {
                width: PANEL_WIDTH,
                backgroundColor: theme.background,
                paddingTop: Math.max(insets.top, Spacing.four),
                paddingBottom: Math.max(insets.bottom, Spacing.four),
                transform: [{ translateX: slideAnim }],
              },
            ]}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.brandRow}>
                <View style={styles.logoBadge}>
                  <ThemedText style={styles.logoText}>F</ThemedText>
                </View>
                <View>
                  <ThemedText style={styles.brandTitle}>FinFlow</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.versionText}>
                    v1.0.0 • On-Device
                  </ThemedText>
                </View>
              </View>
              <Pressable hitSlop={12} onPress={onClose} style={styles.closeBtn}>
                <ThemedText style={styles.closeIcon}>✕</ThemedText>
              </Pressable>
            </View>

            <View style={styles.divider} />

            {/* Navigation Menu */}
            <View style={styles.menuList}>
              {/* Automations */}
              <Pressable
                onPress={() => {
                  onClose();
                  router.push('/automations');
                }}
                style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}>
                <View style={[styles.menuIconContainer, { backgroundColor: 'rgba(59, 130, 246, 0.12)' }]}>
                  <ThemedText style={styles.menuIcon}>⚡</ThemedText>
                </View>
                <View style={styles.menuTextContainer}>
                  <ThemedText style={styles.menuTitle}>Automations</ThemedText>
                </View>
                <ThemedText style={styles.chevron}>›</ThemedText>
              </Pressable>

              {/* App Settings */}
              <Pressable
                onPress={() => {
                  onClose();
                  router.push('/settings');
                }}
                style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}>
                <View style={[styles.menuIconContainer, { backgroundColor: 'rgba(139, 92, 246, 0.12)' }]}>
                  <ThemedText style={styles.menuIcon}>⚙️</ThemedText>
                </View>
                <View style={styles.menuTextContainer}>
                  <ThemedText style={styles.menuTitle}>App Settings</ThemedText>
                </View>
                <ThemedText style={styles.chevron}>›</ThemedText>
              </Pressable>

              {/* Balances */}
              <Pressable
                onPress={() => {
                  onClose();
                  router.push('/balances');
                }}
                style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}>
                <View style={[styles.menuIconContainer, { backgroundColor: 'rgba(245, 158, 11, 0.12)' }]}>
                  <ThemedText style={styles.menuIcon}>📊</ThemedText>
                </View>
                <View style={styles.menuTextContainer}>
                  <ThemedText style={styles.menuTitle}>Balances</ThemedText>
                </View>
                <ThemedText style={styles.chevron}>›</ThemedText>
              </Pressable>

              {/* Groups (Splitwise) */}
              <Pressable
                onPress={() => {
                  onClose();
                  router.push('/groups/index');
                }}
                style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}>
                <View style={[styles.menuIconContainer, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
                  <ThemedText style={styles.menuIcon}>👥</ThemedText>
                </View>
                <View style={styles.menuTextContainer}>
                  <ThemedText style={styles.menuTitle}>Groups</ThemedText>
                </View>
                <ThemedText style={styles.chevron}>›</ThemedText>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    zIndex: 100,
    elevation: 20,
    flexDirection: 'row',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  panel: {
    height: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 16,
    paddingHorizontal: Spacing.four,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  logoBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  versionText: {
    fontSize: 11,
  },
  closeBtn: {
    padding: 6,
  },
  closeIcon: {
    fontSize: 16,
    color: '#94a3b8',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(150, 150, 150, 0.2)',
    marginVertical: Spacing.two,
  },
  menuList: {
    flex: 1,
    gap: Spacing.two,
    paddingTop: Spacing.two,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.two,
    gap: Spacing.three,
  },
  menuItemPressed: {
    backgroundColor: 'rgba(150, 150, 150, 0.1)',
  },
  menuIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuIcon: {
    fontSize: 18,
  },
  menuTextContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  chevron: {
    fontSize: 20,
    color: '#94a3b8',
    fontWeight: '300',
  },
  edgeDetector: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 30,
    zIndex: 110,
  },
});
