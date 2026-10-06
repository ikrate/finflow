import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { EncodedQRBundle } from '@/services/groups/qrCodec';

interface QRDisplayProps {
  encodedBundle: EncodedQRBundle;
  title?: string;
  subtitle?: string;
}

export function QRDisplay({ encodedBundle, title, subtitle }: QRDisplayProps) {
  const { frames, totalFrames, isLargeBundle } = encodedBundle;

  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [fps, setFps] = useState(4); // default 4 frames per second
  const [isPaused, setIsPaused] = useState(false);

  // Auto-cycling timer when multi-frame
  useEffect(() => {
    if (totalFrames <= 1 || isPaused) return;

    const intervalMs = Math.max(100, Math.round(1000 / fps));
    const timer = setInterval(() => {
      setCurrentFrameIndex((prev) => (prev + 1) % totalFrames);
    }, intervalMs);

    return () => clearInterval(timer);
  }, [totalFrames, fps, isPaused]);

  const currentFrame = frames[currentFrameIndex] || frames[0] || '';

  const handleSpeedDecrease = () => {
    setFps((prev) => Math.max(1, prev - 1));
  };

  const handleSpeedIncrease = () => {
    setFps((prev) => Math.min(10, prev + 1));
  };

  return (
    <ThemedView type="backgroundElement" style={styles.container}>
      {title ? (
        <ThemedText type="smallBold" style={styles.title}>
          {title}
        </ThemedText>
      ) : null}

      {subtitle ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
          {subtitle}
        </ThemedText>
      ) : null}

      {isLargeBundle && (
        <View style={styles.warningBanner}>
          <ThemedText style={styles.warningText}>
            ⚠️ Large sync payload ({totalFrames} frames). Hold steady while scanning.
          </ThemedText>
        </View>
      )}

      {/* QR Code Canvas */}
      <Pressable
        onPress={() => totalFrames > 1 && setIsPaused(!isPaused)}
        style={styles.qrContainer}>
        <View style={styles.qrWrapper}>
          <QRCode
            value={currentFrame}
            size={240}
            color="#000000"
            backgroundColor="#ffffff"
            quietZone={10}
          />
        </View>

        {totalFrames > 1 && (
          <View style={styles.pauseOverlay}>
            <ThemedText style={styles.pauseHint}>
              {isPaused ? '▶️ TAP TO RESUME' : '⏸️ TAP TO PAUSE'}
            </ThemedText>
          </View>
        )}
      </Pressable>

      {/* Frame Counter & Controls */}
      {totalFrames > 1 ? (
        <View style={styles.controlsContainer}>
          <View style={styles.frameBadge}>
            <ThemedText style={styles.frameBadgeText}>
              Frame {currentFrameIndex + 1} of {totalFrames}
            </ThemedText>
          </View>

          <View style={styles.speedRow}>
            <ThemedText type="small" themeColor="textSecondary">
              Speed: {fps} fps
            </ThemedText>
            <View style={styles.speedBtnGroup}>
              <Pressable
                onPress={handleSpeedDecrease}
                disabled={fps <= 1}
                style={[styles.speedBtn, fps <= 1 && styles.speedBtnDisabled]}>
                <ThemedText style={styles.speedBtnText}>-</ThemedText>
              </Pressable>
              <Pressable
                onPress={handleSpeedIncrease}
                disabled={fps >= 10}
                style={[styles.speedBtn, fps >= 10 && styles.speedBtnDisabled]}>
                <ThemedText style={styles.speedBtnText}>+</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.staticHint}>
          <ThemedText type="small" themeColor="textSecondary">
            Hold this QR code up for the other phone to scan
          </ThemedText>
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.four,
    borderRadius: 20,
    alignItems: 'center',
    gap: Spacing.two,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: Spacing.two,
  },
  warningBanner: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  warningText: {
    color: '#d97706',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  qrContainer: {
    alignItems: 'center',
    marginVertical: Spacing.one,
  },
  qrWrapper: {
    backgroundColor: '#ffffff',
    padding: 12,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  pauseOverlay: {
    marginTop: 8,
  },
  pauseHint: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: '#3b82f6',
  },
  controlsContainer: {
    width: '100%',
    alignItems: 'center',
    gap: Spacing.two,
  },
  frameBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 14,
  },
  frameBadgeText: {
    color: '#3b82f6',
    fontSize: 13,
    fontWeight: '700',
  },
  speedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: Spacing.three,
  },
  speedBtnGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  speedBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(150, 150, 150, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  speedBtnDisabled: {
    opacity: 0.3,
  },
  speedBtnText: {
    fontSize: 18,
    fontWeight: '700',
  },
  staticHint: {
    marginTop: Spacing.one,
  },
});
