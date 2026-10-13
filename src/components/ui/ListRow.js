import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useTheme} from '../../context/ThemeContext';
import {spacing, typography} from '../../utils/theme';
import IconCircle from './IconCircle';

// Standard list row: [icon] title / subtitle ........ value [chevron]
// `divider` draws an inset line under the row (starts after the icon).
const ListRow = ({
  icon,
  iconColor,
  iconBackground,
  leading,
  leadingSize = 36,
  title,
  subtitle,
  value,
  valueColor,
  valueSubtitle,
  trailing,
  chevron = false,
  danger = false,
  divider = false,
  onPress,
  onLongPress,
  style,
}) => {
  const {colors} = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const titleColor = danger ? colors.error : colors.text.primary;
  const hasLeading = Boolean(leading || icon);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={!onPress && !onLongPress}
      android_ripple={{color: colors.primarySoft}}
      style={({pressed}) => [styles.row, pressed && styles.pressed, style]}>
      {leading ||
        (icon ? (
          <IconCircle
            name={icon}
            size={36}
            shape="square"
            color={danger ? colors.error : iconColor}
            background={iconBackground}
          />
        ) : null)}
      <View style={[styles.body, hasLeading && styles.bodyWithLeading]}>
        <Text style={[styles.title, {color: titleColor}]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value !== undefined && value !== null && value !== '' ? (
        <View style={styles.valueBlock}>
          <Text style={[styles.value, valueColor && {color: valueColor}]} numberOfLines={1}>
            {value}
          </Text>
          {valueSubtitle ? (
            <Text style={styles.valueSubtitle} numberOfLines={1}>
              {valueSubtitle}
            </Text>
          ) : null}
        </View>
      ) : null}
      {trailing}
      {chevron ? (
        <Icon name="chevron-forward" size={18} color={colors.text.light} style={styles.chevron} />
      ) : null}
      {divider ? (
        <View
          style={[styles.divider, hasLeading && {left: spacing.md + leadingSize + 12}]}
        />
      ) : null}
    </Pressable>
  );
};

const createStyles = colors =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 56,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
    },
    pressed: {
      backgroundColor: colors.primarySoft,
    },
    body: {
      flex: 1,
      justifyContent: 'center',
    },
    bodyWithLeading: {
      marginLeft: 12,
    },
    title: {
      ...typography.bodyStrong,
    },
    subtitle: {
      ...typography.caption,
      color: colors.text.secondary,
      marginTop: 2,
    },
    valueBlock: {
      alignItems: 'flex-end',
      marginLeft: spacing.sm,
      maxWidth: '45%',
    },
    value: {
      ...typography.bodyStrong,
      color: colors.text.primary,
    },
    valueSubtitle: {
      ...typography.caption,
      color: colors.text.light,
      marginTop: 2,
    },
    chevron: {
      marginLeft: 6,
    },
    divider: {
      position: 'absolute',
      left: spacing.md,
      right: 0,
      bottom: 0,
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
    },
  });

export default React.memo(ListRow);
