import React from 'react';
import {View, StyleSheet} from 'react-native';
import {useTheme} from '../context/ThemeContext';

// Neutral boot surface: avoids Login flash while launch coordinator resolves target route.
const LAUNCH_SURFACE_COLOR = '#111318';

const BootScreen = () => {
  const {colors} = useTheme();
  const styles = React.useMemo(() => StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background || LAUNCH_SURFACE_COLOR,
    },
  }), [colors.background]);
  return <View style={styles.root} />;
};

export default BootScreen;


