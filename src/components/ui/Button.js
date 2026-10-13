import React from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useTheme} from '../../context/ThemeContext';
import {radius, typography} from '../../utils/theme';
import {hapticTap} from '../../utils/haptics';

// App-wide button. variant: primary | secondary | ghost | danger ; size: md | sm
const Button = ({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconColor,
  loading = false,
  disabled = false,
  fullWidth = false,
  haptic = false,
  style,
  textStyle,
  accessibilityLabel,
}) => {
  const {colors} = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const tone = {
    primary: {bg: colors.primary, fg: colors.onPrimary, border: colors.primary},
    secondary: {bg: colors.surfaceMuted, fg: colors.text.primary, border: colors.border},
    ghost: {bg: 'transparent', fg: colors.text.primary, border: 'transparent'},
    danger: {bg: colors.error, fg: colors.white, border: colors.error},
  }[variant] || {bg: colors.primary, fg: colors.onPrimary, border: colors.primary};
  const isDisabled = disabled || loading;

  const handlePress = event => {
    if (haptic) {
      hapticTap();
    }
    onPress?.(event);
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{disabled: isDisabled, busy: loading}}
      style={({pressed}) => [
        styles.base,
        size === 'sm' ? styles.sm : styles.md,
        {backgroundColor: tone.bg, borderColor: tone.border},
        fullWidth && styles.fullWidth,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator size="small" color={tone.fg} />
      ) : (
        <View style={styles.content}>
          {icon ? (
            <Icon name={icon} size={size === 'sm' ? 16 : 18} color={iconColor || tone.fg} />
          ) : null}
          {label ? (
            <Text
              style={[size === 'sm' ? styles.labelSm : styles.label, {color: tone.fg}, textStyle]}
              numberOfLines={1}>
              {label}
            </Text>
          ) : null}
        </View>
      )}
    </Pressable>
  );
};

const createStyles = () =>
  StyleSheet.create({
    base: {
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
    },
    md: {
      minHeight: 48,
      borderRadius: radius.md,
      paddingHorizontal: 18,
    },
    sm: {
      minHeight: 36,
      borderRadius: radius.sm + 2,
      paddingHorizontal: 12,
    },
    fullWidth: {
      alignSelf: 'stretch',
    },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    label: {
      ...typography.bodyStrong,
    },
    labelSm: {
      ...typography.label,
      fontWeight: '600',
    },
    pressed: {
      opacity: 0.85,
      transform: [{scale: 0.98}],
    },
    disabled: {
      opacity: 0.45,
    },
  });

export default React.memo(Button);
