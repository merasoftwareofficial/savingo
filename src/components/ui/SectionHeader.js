import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {useTheme} from '../../context/ThemeContext';
import {spacing, typography} from '../../utils/theme';

// Small heading above a group: TITLE ............ Action
const SectionHeader = ({title, actionLabel, onAction, right, style}) => {
  const {colors} = useTheme();
  return (
    <View style={[styles.row, style]}>
      <Text style={[styles.title, {color: colors.text.secondary}]} numberOfLines={1}>
        {title}
      </Text>
      {right}
      {actionLabel && onAction ? (
        <TouchableOpacity onPress={onAction} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
          <Text style={[styles.action, {color: colors.text.primary}]}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.overline,
    flex: 1,
  },
  action: {
    ...typography.label,
    fontWeight: '600',
  },
});

export default React.memo(SectionHeader);
