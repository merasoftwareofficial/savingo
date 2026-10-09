import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import {spacing, fontSize, fontWeight} from '../utils/theme';
import {useTheme} from '../context/ThemeContext';
import {useAppAlert} from '../context/AppAlertContext';

const createStyles = colors =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
    },
    card: {
      backgroundColor: colors.modal,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
    title: {
      fontSize: fontSize.large,
      fontWeight: fontWeight.bold,
      color: colors.text.primary,
      marginBottom: spacing.xs,
    },
    text: {
      fontSize: fontSize.regular,
      color: colors.text.primary,
    },
    textMuted: {
      fontSize: fontSize.small,
      color: colors.text.secondary,
      marginTop: 4,
    },
    captchaLabel: {
      marginTop: spacing.md,
      fontSize: fontSize.regular,
      color: colors.text.primary,
      fontWeight: fontWeight.semibold,
    },
    input: {
      marginTop: spacing.xs,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      color: colors.text.primary,
      fontSize: fontSize.regular,
      backgroundColor: colors.input,
    },
    actions: {
      marginTop: spacing.md,
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: spacing.sm,
    },
    button: {
      borderRadius: 10,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    cancelButton: {
      backgroundColor: colors.surfaceMuted,
    },
    dangerButton: {
      backgroundColor: '#B91C1C',
    },
    cancelText: {
      color: colors.text.secondary,
      fontWeight: fontWeight.semibold,
    },
    dangerText: {
      color: colors.white,
      fontWeight: fontWeight.semibold,
    },
  });

const generateCaptcha = () => ({
  left: Math.floor(Math.random() * 9) + 2,
  right: Math.floor(Math.random() * 9) + 2,
});

const DestructiveCaptchaModal = ({
  visible,
  onClose,
  onConfirm,
  loading = false,
  title = 'Final Security Check',
  message = '',
  helperText = '',
  confirmLabel = 'Confirm',
  loadingLabel = 'Processing...',
  invalidTitle = 'Invalid CAPTCHA',
  invalidMessage = 'Please solve the captcha correctly.',
  inputPlaceholder = 'Enter answer',
}) => {
  const {colors} = useTheme();
  const {showAlert} = useAppAlert();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [captcha, setCaptcha] = React.useState(() => generateCaptcha());
  const [answer, setAnswer] = React.useState('');

  React.useEffect(() => {
    if (visible) {
      setCaptcha(generateCaptcha());
      setAnswer('');
    }
  }, [visible]);

  const themedAlert = React.useCallback(
    (alertTitle, alertMessage) => {
      showAlert({
        title: String(alertTitle || ''),
        message: String(alertMessage || ''),
        actions: [{text: 'OK'}],
      });
    },
    [showAlert]
  );

  const handleClose = React.useCallback(() => {
    if (loading) {
      return;
    }
    setAnswer('');
    onClose?.();
  }, [loading, onClose]);

  const handleConfirm = React.useCallback(async () => {
    const expected = String(captcha.left + captcha.right);
    const provided = String(answer || '').trim();
    if (provided !== expected) {
      themedAlert(invalidTitle, invalidMessage);
      return;
    }
    await onConfirm?.();
  }, [answer, captcha.left, captcha.right, invalidMessage, invalidTitle, onConfirm, themedAlert]);

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.text}>{message}</Text> : null}
          {helperText ? <Text style={styles.textMuted}>{helperText}</Text> : null}
          <Text style={styles.captchaLabel}>
            Solve: {captcha.left} + {captcha.right} = ?
          </Text>
          <TextInput
            value={answer}
            onChangeText={setAnswer}
            keyboardType="number-pad"
            editable={!loading}
            style={styles.input}
            placeholder={inputPlaceholder}
            placeholderTextColor={colors.text.light}
          />
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={handleClose}
              disabled={loading}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.dangerButton]}
              onPress={handleConfirm}
              disabled={loading}>
              <Text style={styles.dangerText}>
                {loading ? loadingLabel : confirmLabel}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default DestructiveCaptchaModal;
