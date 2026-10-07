import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface PasteInviteModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmitLink: (link: string) => void;
}

export function PasteInviteModal({
  visible,
  onClose,
  onSubmitLink,
}: PasteInviteModalProps) {
  const theme = useTheme();
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  const handlePasteClipboard = async () => {
    try {
      const clipText = await Clipboard.getStringAsync();
      if (clipText && clipText.trim()) {
        setText(clipText.trim());
        setError('');
      } else {
        setError('Clipboard is empty');
      }
    } catch (err) {
      setError('Could not access clipboard');
    }
  };

  const handleConfirm = () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setError('Please paste or type an invite link');
      return;
    }
    setError('');
    onSubmitLink(trimmed);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.cardContainer} onPress={(e) => e.stopPropagation()}>
          <ThemedView type="backgroundElement" style={styles.card}>
            <View style={styles.header}>
              <ThemedText type="subtitle">Paste Group Invite</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Paste the finflow://join link you received from a member.
              </ThemedText>
            </View>

            <TextInput
              value={text}
              onChangeText={(t) => {
                setText(t);
                if (error) setError('');
              }}
              placeholder="finflow://join?d=..."
              placeholderTextColor="#94a3b8"
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              numberOfLines={3}
              style={[
                styles.input,
                {
                  color: theme.text,
                  backgroundColor: theme.background,
                  borderColor: error ? '#ef4444' : 'rgba(150, 150, 150, 0.25)',
                },
              ]}
            />

            {error ? <ThemedText style={styles.errorText}>{error}</ThemedText> : null}

            <View style={styles.actions}>
              <Pressable onPress={handlePasteClipboard} style={styles.clipboardBtn}>
                <ThemedText style={styles.clipboardBtnText}>📋 Paste from Clipboard</ThemedText>
              </Pressable>

              <View style={styles.bottomButtons}>
                <Pressable onPress={onClose} style={styles.cancelBtn}>
                  <ThemedText style={styles.cancelBtnText}>Cancel</ThemedText>
                </Pressable>

                <Pressable onPress={handleConfirm} style={styles.confirmBtn}>
                  <ThemedText style={styles.confirmBtnText}>Open Invite</ThemedText>
                </Pressable>
              </View>
            </View>
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
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  cardContainer: {
    width: '100%',
    maxWidth: 420,
  },
  card: {
    borderRadius: 20,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  header: {
    gap: 4,
  },
  input: {
    minHeight: 80,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 13,
  },
  actions: {
    gap: Spacing.two,
  },
  clipboardBtn: {
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
  },
  clipboardBtnText: {
    color: '#3b82f6',
    fontWeight: '700',
    fontSize: 14,
  },
  bottomButtons: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  cancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(150, 150, 150, 0.15)',
  },
  cancelBtnText: {
    fontWeight: '600',
    fontSize: 15,
  },
  confirmBtn: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#3b82f6',
  },
  confirmBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
});
