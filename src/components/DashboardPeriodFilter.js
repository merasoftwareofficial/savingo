import React, {useState} from 'react';
import {View, StyleSheet} from 'react-native';
import {spacing} from '../utils/theme';
import SegmentedControl from './ui/SegmentedControl';
import DashboardQuickPeriodSheet, {QUICK_PERIODS} from './DashboardQuickPeriodSheet';
import DashboardCalendarSheet from './DashboardCalendarSheet';
import DashboardReportSheet from './DashboardReportSheet';
import MetricsBar from './ui/MetricsBar';
import {useTheme} from '../context/ThemeContext';

const MONTHS_SHORT = [
  'Jan','Feb','Mar','Apr','May','Jun',
  'Jul','Aug','Sep','Oct','Nov','Dec',
];

const formatDateRange = (startTs, endTs) => {
  if (!startTs || !endTs) return 'Calendar';
  const start = new Date(startTs);
  const end = new Date(endTs);
  return `${MONTHS_SHORT[start.getMonth()]}${start.getDate()}-${MONTHS_SHORT[end.getMonth()]}${end.getDate()}`;
};

const SELECTOR_TABS = [
  {key: 'quick', icon: 'time-outline', label: 'Period'},
  {key: 'calendar', icon: 'calendar-outline', label: 'Calendar'},
  {key: 'report', icon: 'document-text-outline', label: 'Reports'},
];

const DashboardPeriodFilter = ({
  quickPeriod,
  onQuickPeriodChange,
  selectedMonth,
  selectedYear,
  customStartDate,
  customEndDate,
  onCustomDateRange,
  onClearAll,
  accounts,
  monthStartDay,
  filteredEarning,
  filteredWithdrawals,
  netBalance,
  formatCurrencyRupee,
  metricsLabels,
}) => {
  const {colors} = useTheme();
  const [activeSheet, setActiveSheet] = useState(null);
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const hasCalendarFilter = !!customStartDate || selectedMonth !== null;
  const activeModeKey = hasCalendarFilter ? 'calendar' : 'quick';
  const activeTabKey = activeSheet || activeModeKey;
  const segments = SELECTOR_TABS.map(tab => ({
    ...tab,
    label:
      tab.key === 'quick'
        ? hasCalendarFilter
          ? tab.label
          : QUICK_PERIODS.find(p => p.value === quickPeriod)?.label || tab.label
        : tab.key === 'calendar'
        ? formatDateRange(customStartDate, customEndDate)
        : tab.label,
  }));

  return (
    <View style={styles.wrapper}>
      <SegmentedControl
        options={segments}
        value={activeTabKey}
        onChange={setActiveSheet}
        style={styles.segmented}
      />

      {/* Metrics */}
      <MetricsBar
        earning={filteredEarning}
        expenses={filteredWithdrawals}
        netBalance={netBalance}
        formatCurrencyRupee={formatCurrencyRupee}
        labels={metricsLabels}
      />

      {/* Sheets */}
      <DashboardQuickPeriodSheet
        visible={activeSheet === 'quick'}
        onClose={() => setActiveSheet(null)}
        quickPeriod={quickPeriod}
        onSelect={onQuickPeriodChange}
      />
      <DashboardCalendarSheet
        visible={activeSheet === 'calendar'}
        onClose={() => setActiveSheet(null)}
        onCustomDateRange={onCustomDateRange}
        onClearAll={onClearAll}
        accounts={accounts}
        customStartDate={customStartDate}
        customEndDate={customEndDate}
      />
      <DashboardReportSheet
        visible={activeSheet === 'report'}
        onClose={() => setActiveSheet(null)}
        accounts={accounts}
        formatCurrencyRupee={formatCurrencyRupee}
      />
    </View>
  );
};

const createStyles = colors => StyleSheet.create({
  wrapper: {
    backgroundColor: colors.headerBg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md - 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  segmented: {
    marginBottom: spacing.sm + 2,
  },
});

export default DashboardPeriodFilter;
