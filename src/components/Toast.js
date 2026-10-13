import React, {useCallback, useEffect, useRef} from 'react';
import {Text, Animated, StyleSheet, PanResponder} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {darkColors, lightColors, radius, spacing, typography} from '../utils/theme';
import {useTheme} from '../context/ThemeContext';

const SWIPE_DISMISS_DISTANCE = 80;

// Snackbar: slides up above the tab bar, inverse surface, swipe sideways to dismiss.
const Toast = ({message, type = 'success', duration = 2000, onDismiss}) => {
  const {colors, isDark} = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const enter = useRef(new Animated.Value(0)).current;
  const dragX = useRef(new Animated.Value(0)).current;
  const dismissedRef = useRef(false);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const dismiss = useCallback(() => {
    if (dismissedRef.current) {
      return;
    }
    dismissedRef.current = true;
    Animated.timing(enter, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => onDismiss?.());
  }, [enter, onDismiss]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 8,
      onPanResponderMove: (_, gesture) => dragX.setValue(gesture.dx),
      onPanResponderRelease: (_, gesture) => {
        if (Math.abs(gesture.dx) > SWIPE_DISMISS_DISTANCE) {
          Animated.timing(dragX, {
            toValue: gesture.dx > 0 ? 500 : -500,
            duration: 160,
            useNativeDriver: true,
          }).start(() => {
            dismissedRef.current = true;
            onDismissRef.current?.();
          });
          return;
        }
        Animated.spring(dragX, {toValue: 0, useNativeDriver: true}).start();
      },
    }),
  ).current;

  useEffect(() => {
    Animated.spring(enter, {
      toValue: 1,
      useNativeDriver: true,
      tension: 90,
      friction: 11,
    }).start();
    const timer = setTimeout(dismiss, duration);
    return () => clearTimeout(timer);
  }, [duration, enter, dismiss]);

  const icon = {
    success: 'checkmark-circle',
    error: 'close-circle',
    warning: 'alert-circle',
    info: 'information-circle',
  }[type] || 'checkmark-circle';
  // The toast sits on an inverse surface, so its icon uses the opposite palette's tones.
  const inverse = isDark ? lightColors : darkColors;
  const iconColor = {
    success: inverse.success,
    error: inverse.error,
    warning: inverse.warning,
    info: colors.onPrimary,
  }[type] || colors.onPrimary;

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.toast,
        {
          opacity: enter,
          transform: [
            {translateY: enter.interpolate({inputRange: [0, 1], outputRange: [40, 0]})},
            {translateX: dragX},
          ],
        },
      ]}>
      <Icon name={icon} size={22} color={iconColor} />
      <Text style={styles.toastText} numberOfLines={2}>
        {message}
      </Text>
    </Animated.View>
  );
};

const createStyles = colors => StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: 112,
    left: spacing.md,
    right: spacing.md,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    backgroundColor: colors.primary,
    elevation: 8,
    shadowColor: colors.shadow,
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  toastText: {
    ...typography.label,
    fontWeight: '600',
    color: colors.onPrimary,
    flexShrink: 1,
  },
});

export default Toast;
