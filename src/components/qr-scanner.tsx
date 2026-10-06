import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { QRBundle, QRFrameAssembler } from '@/services/groups/qrCodec';

interface QRScannerProps {
  onBundleScanned: (bundle: QRBundle) => void;
  onCancel?: () => void;
  expectedGroupId?: string;
  instructionText?: string;
}

export function QRScanner({
  onBundleScanned,
  onCancel,
  expectedGroupId,
  instructionText,
}: QRScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const assemblerRef = useRef(new QRFrameAssembler());

  const [receivedCount, setReceivedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [percent, setPercent] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  useEffect(() => {
    assemblerRef.current.reset();
  }, []);

  const handleBarcodeScanned = (event: { data: string }) => {
    if (isCompleted) return;

    const rawData = event.data;
    const res = assemblerRef.current.addFrame(rawData);

    if (res.status === 'different_bundle') {
      Alert.alert(
        'Different QR Transfer Detected',
        'You scanned a code from a different sync session. Do you want to reset and scan this new session?',
        [
          { text: 'Keep Current', style: 'cancel' },
          {
            text: 'Reset and Start New',
            onPress: () => {
              assemblerRef.current.reset();
              setReceivedCount(0);
              setTotalCount(0);
              setPercent(0);
              setErrorBanner(null);
            },
          },
        ]
      );
      return;
    }

    if (res.status === 'error') {
      setErrorBanner(res.error || 'Failed to read frame');
      return;
    }

    const progress = assemblerRef.current.getProgress();
    setReceivedCount(progress.received);
    setTotalCount(progress.total);
    setPercent(progress.percent);
    setErrorBanner(null);

    if (res.status === 'complete' && res.bundle) {
      if (expectedGroupId && res.bundle.groupId !== expectedGroupId) {
        Alert.alert(
          'Group Mismatch',
          `This QR code is for a different group. Please scan a QR code belonging to this group.`
        );
        assemblerRef.current.reset();
        setReceivedCount(0);
        setTotalCount(0);
        setPercent(0);
        return;
      }

      setIsCompleted(true);
      onBundleScanned(res.bundle);
    }
  };

  const handleReset = () => {
    assemblerRef.current.reset();
    setReceivedCount(0);
    setTotalCount(0);
    setPercent(0);
    setIsCompleted(false);
    setErrorBanner(null);
  };

  // Permission handling
  if (!permission) {
    return (
      <ThemedView type="backgroundElement" style={styles.permissionBox}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </ThemedView>
    );
  }

  if (!permission.granted) {
    return (
      <ThemedView type="backgroundElement" style={styles.permissionBox}>
        <ThemedText style={styles.permissionIcon}>📷</ThemedText>
        <ThemedText type="smallBold" style={styles.permissionTitle}>
          Camera Permission Needed
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.permissionSubtitle}>
          FinFlow uses your camera exclusively to scan offline QR codes for group syncing. No photos or videos are stored or shared.
        </ThemedText>

        <Pressable onPress={requestPermission} style={styles.grantBtn}>
          <ThemedText style={styles.grantBtnText}>Grant Camera Access</ThemedText>
        </Pressable>

        <Pressable onPress={() => Linking.openSettings()} style={styles.settingsBtn}>
          <ThemedText style={styles.settingsBtnText}>Open Settings</ThemedText>
        </Pressable>

        {onCancel && (
          <Pressable onPress={onCancel} style={styles.cancelTextBtn}>
            <ThemedText style={{ color: '#ef4444', fontWeight: '600' }}>Cancel</ThemedText>
          </Pressable>
        )}
      </ThemedView>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
        onBarcodeScanned={isCompleted ? undefined : handleBarcodeScanned}
      />

      {/* Target Reticle Overlay */}
      <View style={styles.overlay}>
        <View style={styles.targetFrame}>
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
        </View>

        {/* Instructions */}
        <View style={styles.infoBadge}>
          <ThemedText style={styles.infoBadgeText}>
            {instructionText || 'Point camera at the QR code on the other phone'}
          </ThemedText>
        </View>

        {/* Progress Display */}
        {totalCount > 1 && (
          <View style={styles.progressContainer}>
            <ThemedText style={styles.progressTitle}>
              Receiving frames: {receivedCount} of {totalCount} ({percent}%)
            </ThemedText>
            <View style={styles.progressBarTrack}>
              <View style={[styles.progressBarFill, { width: `${percent}%` }]} />
            </View>
          </View>
        )}

        {errorBanner && (
          <View style={styles.errorBanner}>
            <ThemedText style={styles.errorBannerText}>{errorBanner}</ThemedText>
          </View>
        )}

        {/* Bottom Actions */}
        <View style={styles.bottomActions}>
          <Pressable onPress={handleReset} style={styles.resetBtn}>
            <ThemedText style={styles.resetBtnText}>Restart Scanner</ThemedText>
          </Pressable>
          {onCancel && (
            <Pressable onPress={onCancel} style={styles.cancelBtn}>
              <ThemedText style={styles.cancelBtnText}>Back</ThemedText>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 380,
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#000000',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  targetFrame: {
    width: 220,
    height: 220,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#3b82f6',
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 6,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 6,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 6,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 6,
  },
  infoBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    marginTop: Spacing.three,
  },
  infoBadgeText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  progressContainer: {
    width: '90%',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 12,
    padding: 12,
    marginTop: Spacing.two,
    gap: 6,
    alignItems: 'center',
  },
  progressTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  progressBarTrack: {
    width: '100%',
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#10b981',
  },
  errorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: Spacing.one,
  },
  errorBannerText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  bottomActions: {
    position: 'absolute',
    bottom: 12,
    flexDirection: 'row',
    gap: Spacing.two,
  },
  resetBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  resetBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  cancelBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.7)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  cancelBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  permissionBox: {
    padding: Spacing.five,
    borderRadius: 20,
    alignItems: 'center',
    gap: Spacing.two,
  },
  permissionIcon: {
    fontSize: 44,
  },
  permissionTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  permissionSubtitle: {
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: Spacing.one,
  },
  grantBtn: {
    width: '100%',
    height: 46,
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  grantBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  settingsBtn: {
    width: '100%',
    height: 44,
    backgroundColor: 'rgba(150, 150, 150, 0.15)',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  cancelTextBtn: {
    paddingVertical: 8,
  },
});
