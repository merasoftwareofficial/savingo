import React from 'react';
import {StyleSheet, View} from 'react-native';
import {useTheme} from '../context/ThemeContext';
import {spacing} from '../utils/theme';
import StatTiles from '../components/ui/StatTiles';

// Ledger Talk totals: paid / received / net outstanding.
const LedgerSummaryHeader = ({
  overallBalance,
  formatCurrency,
  formatSignedBalance,
  netOutstandingLabel,
}) => {
  const {colors} = useTheme();
  const net = Number(overallBalance.netBalance) || 0;
  const netColor = net < 0 ? colors.error : net > 0 ? colors.success : colors.text.primary;

  return (
    <View
      style={[
        styles.block,
        {backgroundColor: colors.headerBg, borderBottomColor: colors.border},
      ]}>
      <StatTiles
        tiles={[
          {
            key: 'paid',
            label: 'Paid',
            icon: 'arrow-up',
            tone: colors.error,
            value: formatCurrency(overallBalance.totalPaid),
          },
          {
            key: 'received',
            label: 'Received',
            icon: 'arrow-down',
            tone: colors.success,
            value: formatCurrency(overallBalance.totalGet),
          },
          {
            key: 'net',
            label: netOutstandingLabel,
            icon: 'swap-vertical',
            tone: netColor,
            value: formatSignedBalance(net),
            valueColor: netColor,
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  block: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm + 2,
    paddingBottom: spacing.md - 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});

export default React.memo(LedgerSummaryHeader);
