import React, {useCallback, useMemo, useRef} from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';

export const CTA_VARIANTS = {
  green: {
    gradientStart: '#58D66C',
    gradientEnd: '#1E8D36',
    label: '#1F9D3A',
    outerBorder: 'rgba(19, 106, 34, 0.36)',
    innerBorder: '#B8F1C3',
    shadow: 'rgba(17, 92, 28, 0.45)',
  },
  red: {
    gradientStart: '#FF7C74',
    gradientEnd: '#C92A24',
    label: '#C52922',
    outerBorder: 'rgba(149, 21, 17, 0.36)',
    innerBorder: '#FFD2CF',
    shadow: 'rgba(145, 21, 17, 0.45)',
  },
  yellow: {
    gradientStart: '#FFD875',
    gradientEnd: '#D89A22',
    label: '#D18A1C',
    outerBorder: 'rgba(133, 92, 18, 0.34)',
    innerBorder: '#FFE9B8',
    shadow: 'rgba(120, 81, 15, 0.42)',
  },
  blue: {
    gradientStart: '#82AFFF',
    gradientEnd: '#2457C7',
    label: '#2554BC',
    outerBorder: 'rgba(24, 70, 161, 0.34)',
    innerBorder: '#C8D9FF',
    shadow: 'rgba(23, 60, 140, 0.45)',
    icon: '#FFFFFF',
  },
  lightGrayGreen: {
    gradientStart: '#FFFFFF',
    gradientEnd: '#FFFFFF',
    solidColor: '#F3F4F6',
    label: '#16A34A',
    outerBorder: '#64748B',
    capsuleColor: '#FFFFFF',
    innerBorder: '#64748B',
    shadow: 'rgba(75, 85, 99, 0.28)',
    shadowOpacity: 0.22,
    shadowOffset: {width: 0, height: 1},
    shadowRadius: 2,
    elevation: 2,
    icon: '#16A34A',
    copyCapsuleShadow: false,
  },
  lightGrayGreenGreen: {
    gradientStart: '#FFFFFF',
    gradientEnd: '#FFFFFF',
    solidColor: '#F3F4F6',
    label: '#16A34A',
    outerBorder: '#64748B',
    capsuleColor: '#FFFFFF',
    innerBorder: '#64748B',
    shadow: 'rgba(75, 85, 99, 0.28)',
    shadowOpacity: 0.22,
    shadowOffset: {width: 0, height: 1},
    shadowRadius: 2,
    elevation: 2,
    icon: '#16A34A',
    copyCapsuleShadow: false,
  },
  lightGrayGreenRed: {
    gradientStart: '#FFFFFF',
    gradientEnd: '#FFFFFF',
    solidColor: '#F3F4F6',
    label: '#EF4444',
    outerBorder: '#64748B',
    capsuleColor: '#FFFFFF',
    innerBorder: '#64748B',
    shadow: 'rgba(75, 85, 99, 0.28)',
    shadowOpacity: 0.22,
    shadowOffset: {width: 0, height: 1},
    shadowRadius: 2,
    elevation: 2,
    icon: '#EF4444',
    copyCapsuleShadow: false,
  },
  lightGrayGreenBlue: {
    gradientStart: '#FFFFFF',
    gradientEnd: '#FFFFFF',
    solidColor: '#F3F4F6',
    label: '#2563EB',
    outerBorder: '#64748B',
    capsuleColor: '#FFFFFF',
    innerBorder: '#64748B',
    shadow: 'rgba(75, 85, 99, 0.28)',
    shadowOpacity: 0.22,
    shadowOffset: {width: 0, height: 1},
    shadowRadius: 2,
    elevation: 2,
    icon: '#2563EB',
    copyCapsuleShadow: false,
  },
};

export const CTA_KIND_PRESETS = {
  withdraw: {
    variant: 'lightGrayGreenRed',
    iconName: 'arrow-down',
  },
  transfer: {
    variant: 'lightGrayGreenBlue',
    iconName: 'swap-horizontal',
  },
  paid: {
    variant: 'lightGrayGreenRed',
    iconName: 'arrow-up',
  },
  get: {
    variant: 'lightGrayGreenGreen',
    iconName: 'arrow-down',
  },
  add: {
    variant: 'lightGrayGreenGreen',
    iconName: 'arrow-up-sharp',
  },
};

// ─── New Add Elevated Button ───────────────────────────────────────────────
const AddElevatedButton = ({
  label,
  onPress,
  iconName,
  compact = false,
  disabled = false,
  style,
  iconSize = 20,
  variant = 'lightGrayGreenGreen',
}) => {
  const pressAnim = useRef(new Animated.Value(0)).current;
  const gradientColors = useMemo(() => {
    if (variant === 'lightGrayGreenRed') {
      return {
        start: '#FF7C74',
        end: '#C92A24',
      };
    }
    if (variant === 'lightGrayGreenBlue') {
      return {
        start: '#82AFFF',
        end: '#2457C7',
      };
    }

    return {
      start: '#34D670',
      end: '#15803D',
    };
  }, [variant]);

  const animatedStyle = useMemo(
    () => ({
      transform: [
        {
          scale: pressAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 0.96],
          }),
        },
        {
          translateY: pressAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 2.5],
          }),
        },
      ],
    }),
    [pressAnim],
  );

  const handlePressIn = useCallback(() => {
    if (disabled) return;
    Animated.timing(pressAnim, {
      toValue: 1,
      duration: 80,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [disabled, pressAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(pressAnim, {
      toValue: 0,
      speed: 22,
      bounciness: 2,
      useNativeDriver: true,
    }).start();
  }, [pressAnim]);

  return (
    <Animated.View
      style={[
        addStyles.wrapper,
        disabled && addStyles.disabled,
        animatedStyle,
        style,
      ]}>
      <TouchableOpacity
        disabled={disabled}
        activeOpacity={1}
        style={addStyles.touch}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}>
        <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient
                id="addElevatedGrad"
                x1="0%"
                y1="0%"
                x2="0%"
                y2="100%">
                <Stop offset="0%" stopColor={gradientColors.start} />
                <Stop offset="100%" stopColor={gradientColors.end} />
              </LinearGradient>
            </Defs>
            <Rect
              x="0"
              y="0"
              width="100%"
              height="100%"
              fill="url(#addElevatedGrad)"
            />
          </Svg>
        </View>
        <View pointerEvents="none" style={addStyles.topHighlight} />
        <View style={[addStyles.content, compact && addStyles.contentCompact]}>
          <Icon
            name={iconName || 'arrow-up'}
            size={iconSize}
            color="#FFFFFF"
          />
          <Text style={[addStyles.label, compact && addStyles.labelCompact]}>
            {String(label || '').toUpperCase()}
          </Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const addStyles = StyleSheet.create({
  wrapper: {
    alignSelf: 'center',
    borderRadius: 999,
    shadowColor: '#334155',
    shadowOpacity: 0.35,
    shadowOffset: {width: 0, height: 4},
    shadowRadius: 8,
    elevation: 7,
    overflow: 'hidden',
  },
  touch: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
  },
  contentCompact: {
    paddingHorizontal: 16,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: '#FFFFFF',
  },
  labelCompact: {
    fontSize: 14,
  },
  disabled: {
    opacity: 0.56,
  },
});
// ───────────────────────────────────────────────────────────────────────────

const CTAButton = ({
  label,
  onPress,
  variant = 'green',
  iconName,
  compact = false,
  disabled = false,
  style,
  textStyle,
  iconSize = 20,
  iconColor,
  outerBackgroundColor,
  kind,
}) => {
  const preset = kind && CTA_KIND_PRESETS[kind];
  const resolvedVariant = preset?.variant || variant;

  if (
    resolvedVariant === 'lightGrayGreenGreen' ||
    resolvedVariant === 'lightGrayGreenRed' ||
    resolvedVariant === 'lightGrayGreenBlue'
  ) {
    return (
      <AddElevatedButton
        label={label}
        onPress={onPress}
        iconName={iconName || preset?.iconName}
        compact={compact}
        disabled={disabled}
        style={style}
        iconSize={iconSize}
        variant={resolvedVariant}
      />
    );
  }

  const pressAnim = useRef(new Animated.Value(0)).current;
  const palette = CTA_VARIANTS[resolvedVariant] ?? CTA_VARIANTS.green;
  const gradientId = useMemo(
    () => `ctaGradient_${resolvedVariant}`,
    [resolvedVariant]
  );
  const addAmountGradientId = useMemo(
    () => `ctaAddAmountGradient_${resolvedVariant}`,
    [resolvedVariant]
  );

  const animatedStyle = useMemo(
    () => ({
      transform: [
        {
          scale: pressAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 0.98],
          }),
        },
        {
          translateY: pressAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 1.4],
          }),
        },
      ],
    }),
    [pressAnim],
  );
  const resolvedIconColor = useMemo(
    () =>
      iconName?.startsWith('arrow-up') ||
      (!iconName && preset?.iconName?.startsWith('arrow-up'))
        ? '#FFFFFF'
        : iconColor || palette.icon || '#FFFFFF',
    [iconName, preset?.iconName, iconColor, palette.icon],
  );
  const resolvedIconName = iconName || preset?.iconName || 'arrow-up';
  const resolvedIconSize = useMemo(
    () =>
      resolvedIconName?.startsWith('arrow-up')
        ? iconSize + 4
        : iconSize,
    [resolvedIconName, iconSize],
  );

  const handlePressIn = useCallback(() => {
    if (disabled) {
      return;
    }
    Animated.timing(pressAnim, {
      toValue: 1,
      duration: 90,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [disabled, pressAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(pressAnim, {
      toValue: 0,
      speed: 22,
      bounciness: 2,
      useNativeDriver: true,
    }).start();
  }, [pressAnim]);

  return (
      <Animated.View
      style={[
        styles.wrapper,
        {
          shadowColor: palette.shadow,
          shadowOpacity: palette.shadowOpacity ?? 0.26,
          borderColor: '#16A34A',
          borderWidth: 3,
          shadowOffset: palette.shadowOffset || {width: 0, height: 6},
          shadowRadius: palette.shadowRadius || 8,
        },
        palette.elevation ? {elevation: palette.elevation} : null,
        palette.copyCapsuleShadow
          ? {
              shadowColor: palette.shadow,
              shadowOpacity: palette.shadowOpacity ?? 0.1,
              shadowOffset: {width: 0, height: 1},
              shadowRadius: palette.shadowRadius ?? 2,
              elevation: 1,
            }
          : null,
        palette.flat && styles.wrapperFlat,
        disabled && styles.disabled,
        animatedStyle,
        style,
      ]}>
      <TouchableOpacity
        disabled={disabled}
        activeOpacity={1}
        style={styles.touch}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}>
        {palette.solidColor && !outerBackgroundColor ? (
          resolvedVariant === 'lightGrayGreenGreen' ? (
            <View pointerEvents="none" style={styles.solidLayer}>
              <Svg width="100%" height="100%">
                <Defs>
                  <LinearGradient
                    id={addAmountGradientId}
                    x1="0%"
                    y1="0%"
                    x2="0%"
                    y2="100%">
                    <Stop offset="0%" stopColor="#BEF7C8" />
                    <Stop offset="100%" stopColor="#166534" />
                  </LinearGradient>
                </Defs>
                <Rect
                  x="0"
                  y="0"
                  width="100%"
                  height="100%"
                  fill={`url(#${addAmountGradientId})`}
                />
              </Svg>
            </View>
          ) : (
            <View
              pointerEvents="none"
              style={[
                styles.solidLayer,
                {backgroundColor: outerBackgroundColor || palette.solidColor},
              ]}
            />
          )
        ) : outerBackgroundColor ? (
          <View
            pointerEvents="none"
            style={[
              styles.solidLayer,
              {backgroundColor: outerBackgroundColor || palette.solidColor},
            ]}
          />
        ) : (
          <View pointerEvents="none" style={styles.gradientLayer}>
            <Svg width="100%" height="100%">
              <Defs>
                <LinearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                  <Stop offset="0%" stopColor={palette.gradientStart} />
                  <Stop offset="100%" stopColor={palette.gradientEnd} />
                </LinearGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradientId})`} />
            </Svg>
          </View>
        )}
        <View style={[styles.leftPad, compact && styles.leftPadCompact]}>
          <View
            style={[
              styles.leftCapsule,
              compact && styles.leftCapsuleCompact,
              palette.flat && styles.leftCapsuleFlat,
              palette.capsuleColor && {backgroundColor: palette.capsuleColor},
            ]}>
            <Text
              style={[
                styles.label,
                compact && styles.labelCompact,
                {color: palette.label},
                textStyle,
              ]}>
              {String(label || '').toUpperCase()}
            </Text>
          </View>
        </View>
        <View style={[styles.rightSegment, compact && styles.rightSegmentCompact]}>
          <Icon
            name={resolvedIconName}
            size={resolvedIconSize}
            color={resolvedIconColor}
          />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    alignSelf: 'center',
    borderRadius: 999,
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.26,
    shadowRadius: 8,
    elevation: 6,
    overflow: 'hidden',
  },
  wrapperCapsuleShadow: {
    shadowColor: '#000000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  wrapperFlat: {
    shadowOpacity: 0,
    shadowOffset: {width: 0, height: 0},
    shadowRadius: 0,
    elevation: 0,
  },
  touch: {
    position: 'relative',
    height: 48,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  gradientLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  solidLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  leftPad: {
    flex: 1,
    paddingLeft: 8,
    paddingRight: 3,
    paddingVertical: 3,
    justifyContent: 'center',
  },
  leftPadCompact: {
    paddingLeft: 7,
    paddingRight: 2,
  },
  leftCapsule: {
    width: '100%',
    height: 38,
    alignSelf: 'center',
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  leftCapsuleFlat: {
    shadowOpacity: 0,
    shadowOffset: {width: 0, height: 0},
    shadowRadius: 0,
    elevation: 0,
  },
  leftCapsuleCompact: {
    height: 38,
  },
  label: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  labelCompact: {
    fontSize: 14,
    letterSpacing: 0.2,
  },
  rightSegment: {
    width: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopRightRadius: 999,
    borderBottomRightRadius: 999,
  },
  rightSegmentCompact: {
    width: 46,
  },
  disabled: {
    opacity: 0.56,
  },
});

export default CTAButton;
