import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {spacing, fontSize} from '../utils/theme';
import TapEffect from './ui/TapEffect';
import {useTheme} from '../context/ThemeContext';

const CollapsibleMenuItem = ({title, icon, onPress}) => {
  const {colors} = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  return (
    <TapEffect
      style={styles.menuItem}
      onPress={onPress}>
      <View style={styles.iconPlaceholder} />
      <Text style={styles.menuText}>{title}</Text>
      <Icon
        name="chevron-forward"
        size={20}
        color={colors.text.light}
      />
    </TapEffect>
  );
};

const createStyles = colors => StyleSheet.create({
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.lg,
    paddingRight: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconPlaceholder: {
    width: 24,
    height: 24,
    marginRight: spacing.md,
  },
  menuText: {
    flex: 1,
    fontSize: fontSize.regular,
    color: colors.text.primary,
  },
});

export default CollapsibleMenuItem;
