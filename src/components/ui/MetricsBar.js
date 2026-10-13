import React from 'react';
import {useTheme} from '../../context/ThemeContext';
import StatTiles from './StatTiles';

// Earning / Expenses / Net tiles for the selected period.
const MetricsBar = ({
  earning = 0,
  expenses = 0,
  netBalance = 0,
  formatCurrencyRupee,
  labels,
}) => {
  const {colors} = useTheme();
  const netColor =
    netBalance > 0
      ? colors.success
      : netBalance < 0
      ? colors.error
      : colors.text.primary;
  const netLabel =
    String(labels?.net || '').trim() ||
    (typeof labels?.getNetLabel === 'function'
      ? String(labels.getNetLabel(netBalance) || '').trim()
      : '') ||
    'Net Balance';

  return (
    <StatTiles
      tiles={[
        {
          key: 'earning',
          label: String(labels?.earning || 'Earning'),
          icon: 'arrow-down',
          tone: colors.success,
          value: formatCurrencyRupee(earning),
        },
        {
          key: 'expenses',
          label: String(labels?.expenses || 'Expenses'),
          icon: 'arrow-up',
          tone: colors.error,
          value: formatCurrencyRupee(expenses),
        },
        {
          key: 'net',
          label: netLabel,
          icon: 'swap-vertical',
          tone: netColor,
          value: formatCurrencyRupee(netBalance),
          valueColor: netColor,
        },
      ]}
    />
  );
};

export default MetricsBar;
