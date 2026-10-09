import React, {useMemo} from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {useTheme} from '../../context/ThemeContext';
import {fontSize, fontWeight, spacing} from '../../utils/theme';

const AppAlertModal = ({
  visible,
  title,
  message,
  actions = [],
  processing = false,
  processingIndex = -1,
  onActionPress,
  onRequestClose,
}) => {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const safeActions = actions.length
    ? actions
    : [{text: 'OK', style: 'default'}];

  return (
    <Modal
      transparent
      visible={Boolean(visible)}
      animationType="fade"
      onRequestClose={onRequestClose}>
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onRequestClose}
        />
        <View style={styles.card}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {message ? <Text style={styles.message}>{message}</Text> : null}

          <View style={styles.actions}>
            {safeActions.map((action, index) => {
              const styleType = String(action?.style || 'default');
              const isDestructive = styleType === 'destructive';
              const isCancel = styleType === 'cancel';
              const disabled = processing;
              const showLoader = processing && processingIndex === index;

              return (
                <TouchableOpacity
                  key={`${String(action?.text || 'action')}-${index}`}
                  style={[
                    styles.button,
                    isDestructive && styles.buttonDestructive,
                    isCancel && styles.buttonCancel,
                  ]}
                  activeOpacity={0.86}
                  disabled={disabled}
                  onPress={() => onActionPress?.(index)}>
                  {showLoader ? (
                    <ActivityIndicator
                      size="small"
                      color={isDestructive ? colors.white : colors.text.primary}
                    />
                  ) : (
                    <Text
                      style={[
                        styles.buttonText,
                        isDestructive && styles.buttonTextDestructive,
                        isCancel && styles.buttonTextCancel,
                      ]}>
                      {String(action?.text || 'OK')}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const createStyles = colors =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
    },
    card: {
      width: '100%',
      maxWidth: 360,
      backgroundColor: colors.modal,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.lg,
      gap: spacing.sm,
    },
    title: {
      fontSize: fontSize.large,
      fontWeight: fontWeight.bold,
      color: colors.text.primary,
      textAlign: 'center',
    },
    message: {
      fontSize: fontSize.medium,
      color: colors.text.secondary,
      lineHeight: 20,
      textAlign: 'center',
    },
    actions: {
      marginTop: spacing.sm,
      flexDirection: 'row',
      gap: spacing.sm,
    },
    button: {
      flex: 1,
      minHeight: 44,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
    },
    buttonDestructive: {
      borderColor: colors.error,
      backgroundColor: colors.error,
      borderWidth: 0,
      shadowColor: colors.error,
      shadowOffset: {width: 0, height: 8},
      shadowOpacity: 0.18,
      shadowRadius: 14,
      elevation: 3,
    },
    buttonCancel: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
    },
    buttonText: {
      fontSize: fontSize.medium,
      fontWeight: fontWeight.semibold,
      color: colors.text.primary,
    },
    buttonTextDestructive: {
      color: colors.white,
      letterSpacing: 0.2,
    },
    buttonTextCancel: {
      color: colors.text.primary,
    },
  });

export default AppAlertModal;
