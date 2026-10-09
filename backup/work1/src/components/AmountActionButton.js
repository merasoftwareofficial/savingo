import React, {useMemo} from 'react';
import {TouchableOpacity, Text, StyleSheet, ActivityIndicator} from 'react-native';
import {useTheme} from '../context/ThemeContext';

const createVariants = colors => ({
  neutralOutline: {
    borderColor: colors.border,
    textColor: colors.text.primary,
    backgroundColor: colors.card,
  },
  successOutline: {
    borderColor: '#4ADE80',
    textColor: '#16A34A',
    backgroundColor: colors.card,
  },
  expensesOutline: {
    borderColor: '#10B981',
    textColor: '#10B981',
    backgroundColor: colors.card,
  },
  dangerOutline: {
    borderColor: '#FCA5A5',
    textColor: '#EF4444',
    backgroundColor: colors.card,
  },
  primaryOutline: {
    borderColor: '#93C5FD',
    textColor: '#2563EB',
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
