import React, { useEffect, useState } from 'react';
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
import { Member } from '@/services/groups/types';

interface MemberModalProps {
  visible: boolean;
  onClose: () => void;
  onAddGhost?: (name: string) => void;
  onRename?: (memberId: string, newName: string) => void;
  onClaimGhost?: (memberId: string) => void;
  memberToEdit?: Member | null;
  mode: 'add_ghost' | 'rename' | 'claim';
}

export function MemberModal({
  visible,
  onClose,
  onAddGhost,
  onRename,
  onClaimGhost,
  memberToEdit,
  mode,
}: MemberModalProps) {
  const theme = useTheme();
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    if (mode === 'rename' && memberToEdit) {
      setName(memberToEdit.name);
    } else {
      setName('');
    }
    setError('');
  }, [visible, mode, memberToEdit]);

  const handleSubmit = () => {
    if (mode === 'claim' && memberToEdit && onClaimGhost) {
      onClaimGhost(memberToEdit.id);
      onClose();
      return;
    }

    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name is required');
      return;
    }
    if (trimmed.length > 50) {
      setError('Name must be 50 characters or less');
      return;
    }

    if (mode === 'add_ghost' && onAddGhost) {
      onAddGhost(trimmed);
      onClose();
    } else if (mode === 'rename' && memberToEdit && onRename) {
      onRename(memberToEdit.id, trimmed);
      onClose();
    }
  };

  const getTitle = () => {
    if (mode === 'add_ghost') return 'Add Person (No App)';
    if (mode === 'rename') return 'Rename Member';
    if (mode === 'claim') return 'Claim This Identity';
    return 'Member';
  };

  const getSubtitle = () => {
    if (mode === 'add_ghost') {
      return 'Add a ghost member to split expenses with. They can link their device later via nearby sync.';
    }
    if (mode === 'rename') {
      return `Update name for ${memberToEdit?.name || 'this member'}. This change syncs to everyone.`;
    }
    if (mode === 'claim') {
      return `Link your device to "${memberToEdit?.name}". Your expenses and shares will be associated with you.`;
    }
    return '';
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}>
        <ThemedView type="backgroundElement" style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText style={styles.icon}>
            {mode === 'add_ghost' ? '👤' : mode === 'claim' ? '🔗' : '✏️'}
          </ThemedText>

          <ThemedText type="smallBold" style={styles.title}>
            {getTitle()}
          </ThemedText>

          <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
            {getSubtitle()}
          </ThemedText>

          {mode !== 'claim' && (
            <TextInput
              value={name}
              onChangeText={(t) => {
                setName(t);
                if (error) setError('');
              }}
              placeholder="e.g. Sam"
              placeholderTextColor="#94a3b8"
              maxLength={50}
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
          )}

          {error ? <ThemedText style={styles.errorText}>{error}</ThemedText> : null}

          <View style={styles.btnRow}>
            <Pressable onPress={onClose} style={[styles.cancelBtn, { borderColor: 'rgba(150,150,150,0.3)' }]}>
              <ThemedText style={styles.cancelBtnText}>Cancel</ThemedText>
            </Pressable>
            <Pressable onPress={handleSubmit} style={styles.confirmBtn}>
              <ThemedText style={styles.confirmBtnText}>
                {mode === 'claim' ? 'Claim Identity' : 'Save'}
              </ThemedText>
            </Pressable>
          </View>
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
    gap: Spacing.two,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  icon: {
    fontSize: 32,
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: Spacing.one,
  },
  input: {
    width: '100%',
    height: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 13,
    alignSelf: 'flex-start',
  },
  btnRow: {
    flexDirection: 'row',
    width: '100%',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  cancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontWeight: '600',
  },
  confirmBtn: {
    flex: 1,
    height: 44,
    backgroundColor: '#3b82f6',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmBtnText: {
    color: '#ffffff',
    fontWeight: '700',
  },
});
