import React, {useMemo} from 'react';
import {TouchableOpacity, Text, StyleSheet, ActivityIndicator} from 'react-native';
import {useTheme} from '../context/ThemeContext';
import {withAlpha} from '../utils/color';

const createVariants = colors => ({
  neutralOutline: {
    borderColor: colors.border,
    textColor: colors.text.primary,
    backgroundColor: colors.card,
  },
  successOutline: {
    borderColor: withAlpha(colors.success, 0.5),
    textColor: colors.success,
    backgroundColor: colors.card,
  },
  expensesOutline: {
    borderColor: withAlpha(colors.success, 0.5),
    textColor: colors.success,
    backgroundColor: colors.card,
  },
  dangerOutline: {
    borderColor: withAlpha(colors.error, 0.5),
    textColor: colors.error,
    backgroundColor: colors.card,
  },
  primaryOutline: {
    borderColor: colors.primaryRing,
    textColor: colors.text.primary,
    backgroundColor: colors.card,
  },
});

const AmountActionButton = ({
  label,
  onPress,
  disabled = false,
  loading = false,
  variant = 'neutralOutline',
  style,
  textStyle,
  activityColor,
}) => {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const variants = useMemo(() => createVariants(colors), [colors]);
  const variantStyles = variants[variant] ?? variants.neutralOutline;
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      style={[
        styles.button,
        {
          borderColor: variantStyles.borderColor,
          backgroundColor: variantStyles.backgroundColor,
        },
        isDisabled && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.85}>
      {loading ? (
        <ActivityIndicator color={activityColor ?? variantStyles.textColor} />
      ) : (
        <Text style={[styles.text, {color: variantStyles.textColor}, textStyle]}>
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const createStyles = () =>
  StyleSheet.create({
    button: {
      borderRadius: 999,
      paddingVertical: 14,
      alignItems: 'center',
      borderWidth: 1,
    },
    text: {
      fontSize: 15,
      fontWeight: '700',
    },
    disabled: {
      opacity: 0.6,
    },
  });

export default AmountActionButton;
