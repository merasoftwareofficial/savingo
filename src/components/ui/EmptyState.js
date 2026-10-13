import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useTheme} from '../../context/ThemeContext';
import {spacing, typography} from '../../utils/theme';
import IconCircle from './IconCircle';
import Button from './Button';

// Icon + title + one line + optional action, for lists with no data.
const EmptyState = ({icon = 'file-tray-outline', title, message, actionLabel, onAction, compact = false, style}) => {
  const {colors} = useTheme();
  return (
    <View style={[styles.wrap, compact && styles.compact, style]}>
      <IconCircle name={icon} size={compact ? 44 : 56} color={colors.text.secondary} />
      {title ? (
        <Text style={[styles.title, {color: colors.text.primary}]}>{title}</Text>
      ) : null}
      {message ? (
        <Text style={[styles.message, {color: colors.text.secondary}]}>{message}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} size="sm" style={styles.action} />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  compact: {
    paddingVertical: spacing.md + 4,
  },
  title: {
    ...typography.heading,
    marginTop: spacing.md - 4,
    textAlign: 'center',
  },
  message: {
    ...typography.label,
    marginTop: 4,
    textAlign: 'center',
  },
  action: {
    marginTop: spacing.md,
  },
});

export default React.memo(EmptyState);
