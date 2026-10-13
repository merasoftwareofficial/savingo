import React from 'react';
import {Animated, StyleSheet, Text} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useTheme} from '../../context/ThemeContext';
import {radius, typography} from '../../utils/theme';

const useFocusProgress = focused => {
  const progress = React.useRef(new Animated.Value(focused ? 1 : 0)).current;
  React.useEffect(() => {
    Animated.spring(progress, {
      toValue: focused ? 1 : 0,
      useNativeDriver: true,
      tension: 160,
      friction: 14,
    }).start();
  }, [focused, progress]);
  return progress;
};

// Icon with a pill that grows in behind it when the tab is active.
export const TabBarIcon = ({focused, name, activeName, color}) => {
  const {colors} = useTheme();
  const progress = useFocusProgress(focused);
  return (
    <Animated.View style={styles.iconWrap}>
      <Animated.View
        style={[
          styles.pill,
          {
            backgroundColor: colors.primaryMuted,
            opacity: progress,
            transform: [{scaleX: progress.interpolate({inputRange: [0, 1], outputRange: [0.5, 1]})}],
          },
        ]}
      />
      <Icon name={focused ? activeName || name : name} size={22} color={color} />
    </Animated.View>
  );
};

// Label that is only visible for the active tab (keeps its space so icons never jump).
export const TabBarLabel = ({focused, label, color}) => {
  const progress = useFocusProgress(focused);
  return (
    <Animated.View style={{opacity: progress}}>
      <Text style={[styles.label, {color}]} numberOfLines={1}>
        {label}
      </Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  iconWrap: {
    width: 60,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.pill,
  },
  label: {
    ...typography.caption,
    fontWeight: '600',
    marginTop: 2,
  },
});
