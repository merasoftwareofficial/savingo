import React from 'react';
import {View, StyleSheet} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import BottomSheet from './BottomSheet';
import {spacing, radius} from '../utils/theme';
import ListRow from './ui/ListRow';
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
    <BottomSheet visible={visible} onClose={onClose} title="Select period">
      <View style={styles.list}>
        {QUICK_PERIODS.map((period, index) => {
          const isActive = quickPeriod === period.value;
          return (
            <ListRow
              key={period.value}
              title={period.label}
              divider={index < QUICK_PERIODS.length - 1}
              onPress={() => {
                onSelect(period.value);
                onClose();
              }}
              trailing={
                <Icon
                  name={isActive ? 'checkmark-circle' : 'ellipse-outline'}
                  size={22}
                  color={isActive ? colors.primary : colors.text.light}
                />
              }
            />
          );
        })}
      </View>
    </BottomSheet>
  );
};

const createStyles = colors => StyleSheet.create({
  list: {
    marginHorizontal: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
});

export default DashboardQuickPeriodSheet;
