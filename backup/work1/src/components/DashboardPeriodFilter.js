import React, {useState} from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {fontWeight} from '../utils/theme';
import DashboardQuickPeriodSheet, {QUICK_PERIODS} from './DashboardQuickPeriodSheet';
import DashboardCalendarSheet from './DashboardCalendarSheet';
import DashboardReportSheet from './DashboardReportSheet';
import MetricsBar from './ui/MetricsBar';
import {useTheme} from '../context/ThemeContext';
import {useAdaptiveAccent} from '../hooks/useAdaptiveThemeAccent';

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
  themeColor,
  accentPalette,
  metricsLabels,
}) => {
  const {colors, isDark} = useTheme();
  const [activeSheet, setActiveSheet] = useState(null);
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const fallbackAccent = useAdaptiveAccent(themeColor || '#2563EB');
  const accent = accentPalette || fallbackAccent;
  const inactiveTone = isDark
    ? colors.text.secondary
    : colors.text.light;
  const activeTone = accent.accentSelection || accent.accentPrimary;

  const hasCalendarFilter = !!customStartDate || selectedMonth !== null;
  const activeModeKey = hasCalendarFilter ? 'calendar' : 'quick';

  return (
    <View style={styles.wrapper}>
      {/* Tab row */}
      <View style={styles.tabRow}>
        {SELECTOR_TABS.map(tab => {
          const isActive = activeModeKey === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.tab}
              onPress={() => setActiveSheet(tab.key)}
              activeOpacity={0.7}>
              <View style={styles.periodRow}>
                <Icon
                  name={tab.icon}
                  size={20}
                  color={
                    isActive
                      ? activeTone
                      : inactiveTone
                  }
                />
                <View style={styles.periodTextCol}>
                  <Text
                    style={[
                      styles.tabLabel,
                      isActive && styles.tabLabelActive,
                      !isActive && isDark && styles.tabLabelDark,
                      isActive && {
                        color: activeTone,
                      },
                    ]}>
                    {tab.key === 'quick'
                      ? (hasCalendarFilter ? tab.label : QUICK_PERIODS.find(p => p.value === quickPeriod)?.label || tab.label)
                      : tab.key === 'calendar'
                      ? formatDateRange(customStartDate, customEndDate)
                      : tab.label}
                  </Text>
                </View>
              </View>
              <View
                style={[
                  styles.tabIndicator,
                  isActive && {
                    backgroundColor: activeTone,
                  },
                ]}
              />
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.divider} />

      {/* Metrics */}
      <MetricsBar
        earning={filteredEarning}
        expenses={filteredWithdrawals}
        netBalance={netBalance}
        formatCurrencyRupee={formatCurrencyRupee}
        accentPalette={accent}
        themeColor={accent.accentPrimary}
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
        themeColor={accent.accentPrimary}
        accentPalette={accent}
      />
      <DashboardReportSheet
        visible={activeSheet === 'report'}
        onClose={() => setActiveSheet(null)}
        accounts={accounts}
        themeColor={accent.accentPrimary}
        accentPalette={accent}
        formatCurrencyRupee={formatCurrencyRupee}
      />
    </View>
  );
};

const createStyles = colors => StyleSheet.create({
  wrapper: {
    borderBottomWidth: 1.5,
    borderBottomColor: colors.border,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderBottomWidth: 0,
    shadowColor: '#000000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: 4,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: fontWeight.medium,
    color: colors.text.primary,
  },
  tabLabelDark: {
    color: colors.text.secondary,
  },
  tabLabelActive: {
    fontWeight: fontWeight.semibold,
  },
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 4,
  },
  periodTextCol: {
    alignItems: 'flex-start',
  },
  tabIndicator: {
    height: 2,
    width: '100%',
    borderRadius: 2,
    marginTop: 3,
    backgroundColor: 'transparent',
  },
  tabIndicatorActive: {
    backgroundColor: 'transparent',
  },
  divider: {
    height: 1.5,
    backgroundColor: colors.border,
  },
});

export default DashboardPeriodFilter;
