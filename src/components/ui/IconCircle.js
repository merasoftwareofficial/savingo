import React from 'react';
import {StyleSheet, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useTheme} from '../../context/ThemeContext';
import {radius} from '../../utils/theme';

// Icon on a soft rounded tile. `children` replaces the Ionicon (e.g. account icons).
const IconCircle = ({name, size = 40, iconSize, color, background, shape = 'circle', children, style}) => {
  const {colors} = useTheme();
  const tileRadius = shape === 'square' ? radius.md : size / 2;
  return (
    <View
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: tileRadius,
          backgroundColor: background || colors.surfaceMuted,
        },
        style,
      ]}>
      {children ||
        (name ? (
          <Icon name={name} size={iconSize || Math.round(size * 0.5)} color={color || colors.text.primary} />
        ) : null)}
    </View>
  );
};

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default React.memo(IconCircle);
