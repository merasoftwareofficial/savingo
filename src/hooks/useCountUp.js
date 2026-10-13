import React from 'react';
import {Animated, Easing} from 'react-native';

// Animates a number from its previous value to `target` (used for big amounts).
export const useCountUp = (target, duration = 600) => {
  const safeTarget = Number(target) || 0;
  const [display, setDisplay] = React.useState(safeTarget);
  const animated = React.useRef(new Animated.Value(safeTarget)).current;

  React.useEffect(() => {
    const listenerId = animated.addListener(({value}) => setDisplay(value));
    Animated.timing(animated, {
      toValue: safeTarget,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(({finished}) => {
      if (finished) {
        setDisplay(safeTarget);
      }
    });
    return () => {
      animated.removeListener(listenerId);
    };
  }, [animated, duration, safeTarget]);

  return display;
};
