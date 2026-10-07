import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  Share,
  StyleSheet,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface InviteModalProps {
  visible: boolean;
  onClose: () => void;
  groupName: string;
  inviteLink: string;
}

export function InviteModal({
  visible,
  onClose,
  groupName,
  inviteLink,
}: InviteModalProps) {
  const theme = useTheme();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await Clipboard.setStringAsync(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('Failed to copy invite link', err);
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Join my group "${groupName}" on FinFlow: ${inviteLink}`,
        url: inviteLink,
      });
    } catch (err) {
      console.warn('Failed to open share sheet', err);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheetContainer} onPress={(e) => e.stopPropagation()}>
          <ThemedView type="backgroundElement" style={styles.sheet}>
            {/* Header */}
            <View style={styles.headerRow}>
              <View style={{ flex: 1 }}>
                <ThemedText type="subtitle" numberOfLines={1}>
                  Invite to {groupName}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Scan with Camera or share link
                </ThemedText>
              </View>

              <Pressable hitSlop={12} onPress={onClose} style={styles.closeBtn}>
                <ThemedText style={styles.closeBtnText}>✕</ThemedText>
              </Pressable>
            </View>

            {/* QR Code Container */}
            <View style={styles.qrCard}>
              <View style={styles.qrWrapper}>
                {inviteLink ? (
                  <QRCode
                    value={inviteLink}
                    size={210}
                    color="#000000"
                    backgroundColor="#ffffff"
                  />
                ) : null}
              </View>
              <ThemedText type="small" themeColor="textSecondary" style={styles.cameraHint}>
                Scan directly with the iOS Camera app
              </ThemedText>
            </View>

            {/* Action Buttons */}
            <View style={styles.actionsGroup}>
              <Pressable onPress={handleShare} style={styles.primaryActionBtn}>
                <ThemedText style={styles.primaryActionBtnText}>Share Link</ThemedText>
              </Pressable>

              <Pressable onPress={handleCopy} style={styles.secondaryActionBtn}>
                <ThemedText style={styles.secondaryActionBtnText}>
                  {copied ? '✓ Link Copied' : 'Copy Link'}
                </ThemedText>
              </Pressable>
            </View>

            {/* Constraint Notice */}
            <ThemedText type="small" themeColor="textSecondary" style={styles.footerNote}>
              People must be nearby to sync after joining.
            </ThemedText>
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.five,
    gap: Spacing.three,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 4,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(150, 150, 150, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  qrCard: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  qrWrapper: {
    padding: 16,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  cameraHint: {
    fontSize: 13,
    marginTop: 4,
  },
  actionsGroup: {
    gap: Spacing.two,
    marginTop: 4,
  },
  primaryActionBtn: {
    height: 48,
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryActionBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryActionBtn: {
    height: 46,
    backgroundColor: 'rgba(150, 150, 150, 0.15)',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryActionBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  footerNote: {
    textAlign: 'center',
    fontSize: 13,
    marginTop: 2,
  },
});
