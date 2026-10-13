import React from 'react';
import {Animated, Pressable, StyleSheet, Text, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useTheme} from '../../context/ThemeContext';
import {radius, typography} from '../../utils/theme';

// Pill-shaped segmented control with a sliding "thumb" behind the selected option.
// options: [{key, label, icon?}]
const SegmentedControl = ({options = [], value, onChange, style}) => {
  const {colors, isDark} = useTheme();
  const styles = React.useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [trackWidth, setTrackWidth] = React.useState(0);
  const selectedIndex = Math.max(0, options.findIndex(option => option.key === value));
  const slide = React.useRef(new Animated.Value(selectedIndex)).current;
  const segmentWidth = options.length ? (trackWidth - 8) / options.length : 0;

  React.useEffect(() => {
    Animated.spring(slide, {
      toValue: selectedIndex,
      useNativeDriver: true,
      tension: 140,
      friction: 16,
    }).start();
  }, [selectedIndex, slide]);

  return (
    <View
      style={[styles.track, style]}
      onLayout={event => setTrackWidth(event.nativeEvent.layout.width)}>
      {segmentWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.thumb,
            {
              width: segmentWidth,
              transform: [{translateX: Animated.multiply(slide, segmentWidth)}],
            },
          ]}
        />
      ) : null}
      {options.map(option => {
        const isActive = option.key === value;
        const tint = isActive ? colors.text.primary : colors.text.secondary;
        return (
          <Pressable
            key={option.key}
            style={styles.segment}
            onPress={() => onChange?.(option.key)}
            accessibilityRole="tab"
            accessibilityState={{selected: isActive}}>
            {option.icon ? <Icon name={option.icon} size={15} color={tint} /> : null}
            <Text
              style={[styles.label, {color: tint}, isActive && styles.labelActive]}
              numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const createStyles = (colors, isDark) =>
  StyleSheet.create({
    track: {
      flexDirection: 'row',
      padding: 4,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceMuted,
    },
    thumb: {
      position: 'absolute',
      top: 4,
      bottom: 4,
      left: 4,
      borderRadius: radius.sm + 2,
      backgroundColor: isDark ? colors.input : colors.card,
      shadowColor: colors.shadow,
      shadowOffset: {width: 0, height: 1},
      shadowOpacity: isDark ? 0 : 0.08,
      shadowRadius: 3,
      elevation: isDark ? 0 : 2,
    },
    segment: {
      flex: 1,
      minHeight: 36,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: 6,
    },
    label: {
      ...typography.label,
    },
    labelActive: {
      fontWeight: '700',
    },
  });

export default React.memo(SegmentedControl);
