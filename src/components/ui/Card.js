import React from 'react';
import {StyleSheet, View} from 'react-native';
import {useTheme} from '../../context/ThemeContext';
import {cardElevation, radius, spacing} from '../../utils/theme';

// Rounded surface used for every grouped block on a screen.
const Card = ({children, style, padded = true}) => {
  const {colors, isDark} = useTheme();
  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        card: {
          backgroundColor: colors.card,
          borderRadius: radius.lg,
          ...cardElevation(colors, isDark),
        },
        padded: {
          padding: spacing.md,
        },
      }),
    [colors, isDark],
  );

  return <View style={[styles.card, padded && styles.padded, style]}>{children}</View>;
};

export default React.memo(Card);
