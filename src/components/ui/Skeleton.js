import React from 'react';
import {Animated} from 'react-native';
import {useTheme} from '../../context/ThemeContext';
import {radius as radiusScale} from '../../utils/theme';

// Pulsing grey placeholder block shown while data loads.
const Skeleton = ({width = '100%', height = 14, radius = radiusScale.sm, style}) => {
  const {colors} = useTheme();
  const pulse = React.useRef(new Animated.Value(0.5)).current;

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {toValue: 1, duration: 650, useNativeDriver: true}),
        Animated.timing(pulse, {toValue: 0.5, duration: 650, useNativeDriver: true}),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        {width, height, borderRadius: radius, backgroundColor: colors.surfaceMuted, opacity: pulse},
        style,
      ]}
    />
  );
};

export default React.memo(Skeleton);
