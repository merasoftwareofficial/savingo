import React from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {fontSize, fontWeight, spacing} from '../../utils/theme';
import {useTheme} from '../../context/ThemeContext';

const EditAmountModal = ({
  visible,
  value,
  onChangeText,
  onSave,
  onClose,
  loading = false,
  autoFocus = false,
  title = 'Edit Amount',
  saveLabel = 'Save',
}) => {
  const {colors} = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>{title}</Text>
          <TextInput
            style={styles.modalAmountInput}
            value={value}
            onChangeText={onChangeText}
            keyboardType="numeric"
            autoFocus={autoFocus}
            editable={!loading}
          />
          <TouchableOpacity
            style={[styles.modalAddButton, loading && styles.buttonDisabled]}
            onPress={onSave}
            disabled={loading}>
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.modalAddButtonText}>{saveLabel}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const createStyles = colors => StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalSheet: {
    alignSelf: 'stretch',
    backgroundColor: colors.modal,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: spacing.lg,
  },
  modalHandle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  modalTitle: {
    fontSize: fontSize.large,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  modalAmountInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.large,
    color: colors.text.primary,
    marginBottom: spacing.lg,
  },
  modalAddButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  modalAddButtonText: {
    color: colors.white,
    fontSize: fontSize.medium,
    fontWeight: fontWeight.semibold,
  },
});

export default EditAmountModal;
