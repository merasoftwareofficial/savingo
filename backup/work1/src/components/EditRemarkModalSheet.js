import React, {useEffect, useRef} from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {fontSize, fontWeight, spacing} from '../utils/theme';
import {useTheme} from '../context/ThemeContext';

const EditRemarkModalSheet = ({
  visible,
  onClose,
  value,
  onChangeText,
  onSave,
  loading = false,
  multiline = true,
  placeholder = 'Remark',
}) => {
  const {colors} = useTheme();
  const slideAnim = useRef(new Animated.Value(0)).current;
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    if (!visible) {
      slideAnim.setValue(0);
      return;
    }

    Animated.timing(slideAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [visible, slideAnim]);

  const sheetAnimatedStyle = {
    transform: [
      {
        translateY: slideAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [260, 0],
        }),
      },
    ],
  };

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
        <Animated.View style={[styles.modalSheet, sheetAnimatedStyle]}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Edit Remark</Text>
          <TextInput
            style={styles.modalTextInput}
            placeholder={placeholder}
            placeholderTextColor={colors.text.light}
            value={value}
            onChangeText={onChangeText}
            editable={!loading}
            multiline={multiline}
          />
          <TouchableOpacity
            style={[styles.modalAddButton, loading && styles.buttonDisabled]}
            onPress={onSave}
            disabled={loading}>
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.modalAddButtonText}>Save</Text>
            )}
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
};

const createStyles = colors => StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  modalBackdrop: {
    flex: 1,
  },
  modalSheet: {
    backgroundColor: colors.modal,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: spacing.md,
    paddingBottom: spacing.lg,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  modalTitle: {
    fontSize: fontSize.large,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  modalTextInput: {
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    fontSize: fontSize.medium,
    color: colors.text.primary,
    marginBottom: spacing.md,
    textAlignVertical: 'top',
  },
  modalAddButton: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  modalAddButtonText: {
    fontSize: fontSize.regular,
    fontWeight: fontWeight.bold,
    color: colors.white,
  },
});

export default EditRemarkModalSheet;
