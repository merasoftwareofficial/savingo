import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import ToggleSwitch from './ui/ToggleSwitch';
import {spacing, fontSize, fontWeight} from '../utils/theme';
import {useTheme} from '../context/ThemeContext';

const NotificationToggle = ({
  label,
  icon,
  enabled,
  onToggle,
  subtitle,
  onSubtitlePress,
  showArrow = false,
}) => {
  const {colors} = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  return (
    <TouchableOpacity
      style={styles.container}
      onPress={showArrow ? onSubtitlePress : null}
      activeOpacity={showArrow ? 0.7 : 1}>
      <View style={styles.leftContent}>
        {icon && (
          <View style={styles.iconContainer}>
            <Icon
              name={icon}
              size={24}
              color={colors.primary}
            />
          </View>
        )}
        <View style={styles.textContent}>
          <Text style={styles.label}>{label}</Text>
          {subtitle && (
            <Text style={styles.subtitle}>{subtitle}</Text>
          )}
        </View>
      </View>
      <View style={styles.rightContent}>
        {showArrow && (
          <Icon
            name="chevron-forward"
            size={20}
            color={colors.text.light}
            style={styles.arrow}
          />
        )}
        <ToggleSwitch
          value={enabled}
          onValueChange={onToggle}
          trackColor={{false: colors.border, true: '#81C784'}}
          thumbColor={enabled ? colors.primary : colors.text.secondary}
        />
      </View>
    </TouchableOpacity>
  );
};

const createStyles = colors => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.panel,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  leftContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.panelMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  textContent: {
    flex: 1,
  },
  label: {
    fontSize: fontSize.regular,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: fontSize.small,
    color: colors.text.secondary,
  },
  rightContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  arrow: {
    marginRight: spacing.xs,
  },
});

export default NotificationToggle;
