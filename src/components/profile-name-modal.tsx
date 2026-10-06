import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface ProfileNameModalProps {
  visible: boolean;
  onSave: (name: string) => void;
}

export function ProfileNameModal({ visible, onSave }: ProfileNameModalProps) {
  const theme = useTheme();
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const handleConfirm = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Please enter your name');
      return;
    }
    if (trimmed.length > 30) {
      setError('Name must be 30 characters or less');
      return;
    }
    setError('');
    onSave(trimmed);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}>
        <ThemedView type="backgroundElement" style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <View style={styles.iconBadge}>
            <ThemedText style={styles.icon}>👋</ThemedText>
          </View>

          <ThemedText type="smallBold" style={styles.title}>
            What should your group call you?
          </ThemedText>

          <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
            This is your local display name across groups on this device. You can change it anytime in settings.
          </ThemedText>

          <TextInput
            value={name}
            onChangeText={(text) => {
              setName(text);
              if (error) setError('');
            }}
            placeholder="e.g. Alex"
            placeholderTextColor="#94a3b8"
            maxLength={30}
            autoFocus
            style={[
              styles.input,
              {
                color: theme.text,
                backgroundColor: theme.background,
                borderColor: error ? '#ef4444' : 'rgba(150, 150, 150, 0.3)',
              },
            ]}
          />

          {error ? <ThemedText style={styles.errorText}>{error}</ThemedText> : null}

          <Pressable
            onPress={handleConfirm}
            style={({ pressed }) => [styles.submitBtn, pressed && styles.btnPressed]}>
            <ThemedText style={styles.submitBtnText}>Continue</ThemedText>
          </Pressable>
        </ThemedView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 18,
    padding: Spacing.four,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  iconBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  icon: {
    fontSize: 26,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: Spacing.one,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: Spacing.three,
    lineHeight: 18,
  },
  input: {
    width: '100%',
    height: 46,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 16,
    marginBottom: Spacing.two,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 13,
    alignSelf: 'flex-start',
    marginBottom: Spacing.two,
  },
  submitBtn: {
    width: '100%',
    height: 46,
    backgroundColor: '#3b82f6',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  btnPressed: {
    opacity: 0.8,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
