import React, {useMemo} from 'react';
import {Modal, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {useTheme} from '../../context/ThemeContext';
import {radius, spacing, typography} from '../../utils/theme';
import {withAlpha} from '../../utils/color';
import IconCircle from './IconCircle';
import Button from './Button';

const TONE_ICONS = {
  error: 'close-circle',
  success: 'checkmark-circle',
  warning: 'alert-circle',
  info: 'information-circle',
};

// Picks the icon tone from an explicit `tone`, the title wording, or a destructive action.
const resolveTone = (tone, title, actions) => {
  if (TONE_ICONS[tone]) {
    return tone;
  }
  const text = String(title || '').toLowerCase();
  if (/(error|fail|invalid|unable)/.test(text)) {
    return 'error';
  }
  if (/(success|complete|done|saved|restored)/.test(text)) {
    return 'success';
  }
  if (actions.some(action => action?.style === 'destructive')) {
    return 'warning';
  }
  return 'info';
};

const AppAlertModal = ({
  visible,
  title,
  message,
  tone,
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
  const resolvedTone = resolveTone(tone, title, safeActions);
  const toneColor = {
    error: colors.error,
    success: colors.success,
    warning: colors.warning,
    info: colors.text.primary,
  }[resolvedTone];
  const stacked = safeActions.length > 2;

  return (
    <Modal
      transparent
      visible={Boolean(visible)}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onRequestClose}>
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onRequestClose}
        />
        <View style={styles.card}>
          <IconCircle
            name={TONE_ICONS[resolvedTone]}
            size={52}
            iconSize={28}
            color={toneColor}
            background={withAlpha(toneColor, 0.12)}
            style={styles.icon}
          />
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {message ? <Text style={styles.message}>{message}</Text> : null}

          <View style={[styles.actions, stacked && styles.actionsStacked]}>
            {safeActions.map((action, index) => {
              const styleType = String(action?.style || 'default');
              const variant =
                styleType === 'destructive'
                  ? 'danger'
                  : styleType === 'cancel'
                  ? 'secondary'
                  : safeActions.length > 1 && index < safeActions.length - 1
                  ? 'secondary'
                  : 'primary';
              return (
                <Button
                  key={`${String(action?.text || 'action')}-${index}`}
                  label={String(action?.text || 'OK')}
                  variant={variant}
                  loading={processing && processingIndex === index}
                  disabled={processing}
                  onPress={() => onActionPress?.(index)}
                  style={stacked ? styles.buttonStacked : styles.button}
                />
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
      borderRadius: radius.xl,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.md + 4,
      alignItems: 'center',
    },
    icon: {
      marginBottom: spacing.md - 4,
    },
    title: {
      ...typography.heading,
      fontSize: 18,
      color: colors.text.primary,
      textAlign: 'center',
    },
    message: {
      ...typography.body,
      fontSize: 14,
      color: colors.text.secondary,
      textAlign: 'center',
      marginTop: spacing.xs + 2,
    },
    actions: {
      alignSelf: 'stretch',
      marginTop: spacing.lg,
      flexDirection: 'row',
      gap: spacing.sm,
    },
    actionsStacked: {
      flexDirection: 'column',
    },
    button: {
      flex: 1,
      paddingHorizontal: spacing.sm,
    },
    buttonStacked: {
      alignSelf: 'stretch',
    },
  });

export default AppAlertModal;
