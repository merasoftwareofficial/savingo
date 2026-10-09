import React, {useEffect, useRef} from 'react';
import {Text, Animated, StyleSheet} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {spacing, fontSize, fontWeight} from '../utils/theme';
import {useTheme} from '../context/ThemeContext';

const Toast = ({message, type = 'success', duration = 2000, onDismiss, size = 'medium'}) => {
  const {colors} = useTheme();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.8,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        onDismiss?.();
      });
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, fadeAnim, scaleAnim, onDismiss]);

  const getIconName = () => {
    switch (type) {
      case 'success':
        return 'checkmark-circle';
      case 'error':
        return 'close-circle';
      case 'warning':
        return 'alert-circle';
      case 'info':
        return 'information-circle';
      default:
        return 'checkmark-circle';
    }
  };

  const getColors = () => {
    switch (type) {
      case 'success':
        return {
          bg: '#DCFCE7',
          text: '#166534',
          icon: '#10B981',
          border: '#10B981',
        };
      case 'error':
        return {
          bg: '#FEE2E2',
          text: '#991B1B',
          icon: '#EF4444',
          border: '#EF4444',
        };
      case 'warning':
        return {
          bg: '#FEF3C7',
          text: '#92400E',
          icon: '#F59E0B',
          border: '#F59E0B',
        };
      case 'info':
        return {
          bg: '#CFFAFE',
          text: '#164E63',
          icon: '#3B82F6',
          border: '#3B82F6',
        };
      default:
        return {
          bg: '#DCFCE7',
          text: '#166534',
          icon: '#10B981',
          border: '#10B981',
        };
    }
  };

  const toastColors = getColors();

  return (
    <Animated.View
      style={[
        styles.toast,
        {
          opacity: fadeAnim,
          transform: [{scale: scaleAnim}],
          backgroundColor: toastColors.bg,
          borderColor: toastColors.border,
        },
      ]}>
      <Icon name={getIconName()} size={24} color={toastColors.icon} />
      <Text
        style={[
          styles.toastText,
          {
            color: toastColors.text,
          },
        ]}
        numberOfLines={2}>
        {message}
      </Text>
    </Animated.View>
  );
};

const createStyles = colors => StyleSheet.create({
  toast: {
    position: 'absolute',
    top: '50%',
    alignSelf: 'center',
    borderRadius: 10,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    elevation: 8,
    shadowColor: colors.shadow,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.25,
    shadowRadius: 6,
    borderWidth: 1,
    transform: [{translateY: -40}],
    maxWidth: '90%',
  },
  toastText: {
    fontSize: fontSize.small,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
    flexShrink: 1,
    lineHeight: 18,
  },
});

export default Toast;
