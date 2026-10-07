import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface BarcodeScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onLinkScanned: (link: string) => void;
}

export function BarcodeScannerModal({
  visible,
  onClose,
  onLinkScanned,
}: BarcodeScannerModalProps) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [hasScanned, setHasScanned] = useState(false);

  const handleBarcodeScanned = (event: { data: string }) => {
    if (hasScanned) return;

    const raw = event.data?.trim();
    if (!raw) return;

    if (raw.startsWith('finflow://join')) {
      setHasScanned(true);
      onLinkScanned(raw);
    } else {
      Alert.alert(
        'Invalid QR Code',
        'This code is not a FinFlow group invite. Please scan a valid FinFlow invite QR.',
        [{ text: 'OK' }]
      );
    }
  };

  const handleOpenSettings = async () => {
    try {
      await Linking.openSettings();
    } catch (err) {
      console.warn('Could not open settings', err);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: '#000000' }]}>
        {/* Top Header */}
        <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 12) }]}>
          <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
            <ThemedText style={styles.closeBtnText}>✕ Close</ThemedText>
          </Pressable>
          <ThemedText style={styles.headerTitle}>Scan Invite</ThemedText>
          <View style={{ width: 60 }} />
        </View>

        {/* Camera or Permission Flow */}
        {!permission ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#3b82f6" />
          </View>
        ) : !permission.granted ? (
          <View style={styles.permissionCard}>
            <ThemedText style={styles.permissionIcon}>📷</ThemedText>
            <ThemedText type="title" style={{ textAlign: 'center', color: '#ffffff' }}>
              Camera Access Required
            </ThemedText>
            <ThemedText style={styles.permissionText}>
              FinFlow needs your permission to scan group invite QR codes directly from other screens.
            </ThemedText>

            <Pressable
              onPress={permission.canAskAgain ? requestPermission : handleOpenSettings}
              style={styles.permissionBtn}>
              <ThemedText style={styles.permissionBtnText}>
                {permission.canAskAgain ? 'Allow Camera Access' : 'Open Settings'}
              </ThemedText>
            </Pressable>
          </View>
        ) : (
          <View style={styles.cameraContainer}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ['qr'],
              }}
              onBarcodeScanned={hasScanned ? undefined : handleBarcodeScanned}
            />

            {/* Viewfinder Overlay */}
            <View style={styles.overlay}>
              <View style={styles.viewfinderBox}>
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
              </View>

              <ThemedText style={styles.instructionsText}>
                Point camera at the group invite QR code
              </ThemedText>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.two,
    zIndex: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  closeBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
  },
  closeBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  permissionCard: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  permissionIcon: {
    fontSize: 54,
  },
  permissionText: {
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
  },
  permissionBtn: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: Spacing.two,
  },
  permissionBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  cameraContainer: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.four,
  },
  viewfinderBox: {
    width: 260,
    height: 260,
    position: 'relative',
    backgroundColor: 'transparent',
  },
  corner: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderColor: '#3b82f6',
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },
  instructionsText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
});
