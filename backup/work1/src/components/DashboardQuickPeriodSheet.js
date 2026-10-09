import React from 'react';
import {Text, TouchableOpacity, StyleSheet} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import BottomSheet from './BottomSheet';
import {spacing, fontSize, fontWeight} from '../utils/theme';
import {useTheme} from '../context/ThemeContext';

export const QUICK_PERIODS = [
  {label: 'Last 5 Days',  value: '1week'},
  {label: 'Last 10 Days', value: '10days'},
  {label: 'Last 15 Days', value: '15days'},
  {label: 'Last 30 Days', value: '30days'},
  {label: 'This Month',   value: '1month'},
  {label: '3 Months',     value: '3months'},
  {label: '6 Months',     value: '6months'},
  {label: '1 Year',       value: '1year'},
];

const DashboardQuickPeriodSheet = ({visible, onClose, quickPeriod, onSelect}) => {
  const {colors} = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={styles.title}>Select Period</Text>
      {QUICK_PERIODS.map(period => (
        <TouchableOpacity
          key={period.value}
          style={[
            styles.option,
            quickPeriod === period.value && styles.optionActive,
          ]}
          onPress={() => {
            onSelect(period.value);
            onClose();
          }}
          activeOpacity={0.6}>
          <Text
            style={[
              styles.optionText,
              quickPeriod === period.value && styles.optionTextActive,
            ]}>
            {period.label}
          </Text>
          {quickPeriod === period.value && (
            <Icon name="checkmark" size={18} color={colors.primary} />
          )}
        </TouchableOpacity>
      ))}
    </BottomSheet>
  );
};

const createStyles = colors => StyleSheet.create({
  title: {
    fontSize: fontSize.large,
    fontWeight: fontWeight.bold,
    color: colors.text.primary,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionActive: {
    backgroundColor: colors.surfaceMuted,
  },
  optionText: {
    fontSize: fontSize.medium,
    color: colors.text.primary,
    fontWeight: fontWeight.medium,
  },
  optionTextActive: {
    color: colors.primary,
    fontWeight: fontWeight.bold,
  },
});

export default DashboardQuickPeriodSheet;
