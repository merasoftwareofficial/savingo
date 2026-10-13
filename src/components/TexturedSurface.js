import React from 'react';
import {StyleSheet, View} from 'react-native';
import {useTheme} from '../context/ThemeContext';

// Header / top-bar surface. Plain neutral colour from the light/dark theme.
const TexturedSurface = ({style, children}) => {
  const {colors} = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return <View style={[styles.container, style]}>{children}</View>;
};

const createStyles = colors => StyleSheet.create({
  container: {
    backgroundColor: colors.headerBg,
    overflow: 'hidden',
  },
});

export default TexturedSurface;
