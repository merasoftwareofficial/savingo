import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useTheme} from '../../context/ThemeContext';
import {radius, spacing, typography} from '../../utils/theme';

// Header row used at the top of every bottom sheet: Title (left) ........ (x)
const SheetHeader = ({title, subtitle, onClose, style}) => {
  const {colors} = useTheme();
  return (
    <View style={[styles.row, style]}>
      <View style={styles.titleBlock}>
        <Text style={[styles.title, {color: colors.text.primary}]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, {color: colors.text.secondary}]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {onClose ? (
        <TouchableOpacity
          onPress={onClose}
          style={[styles.close, {backgroundColor: colors.surfaceMuted}]}
          accessibilityLabel="Close"
          hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
          <Icon name="close" size={18} color={colors.text.secondary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm + 4,
  },
  titleBlock: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  title: {
    ...typography.heading,
    fontSize: 18,
  },
  subtitle: {
    ...typography.label,
    marginTop: 2,
  },
  close: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default React.memo(SheetHeader);
