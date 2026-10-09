import React from 'react';
import {View, Text} from 'react-native';

const LedgerSummaryHeader = ({
  styles,
  isDark,
  overallBalance,
  formatCurrency,
  formatSignedBalance,
  netOutstandingLabel,
}) => {
  return (
    <View style={styles.headerBlock}>
      <View style={styles.headerRow} />
      <View style={styles.metricsRow}>
        <View style={styles.metricColumn}>
          <Text style={[styles.metricValue, styles.metricNegative]}>
            {formatCurrency(overallBalance.totalPaid)}
          </Text>
          <View style={styles.metricLabelRow}>
            <Text style={[styles.metricLabel, isDark && styles.metricLabelDark]}>
              Total Paid
            </Text>
          </View>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metricColumn}>
          <Text style={[styles.metricValue, styles.metricPositive]}>
            {formatCurrency(overallBalance.totalGet)}
          </Text>
          <View style={styles.metricLabelRow}>
            <Text style={[styles.metricLabel, isDark && styles.metricLabelDark]}>
              Total Received
            </Text>
          </View>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metricColumn}>
          <Text
            style={[
              styles.metricValue,
              overallBalance.netBalance < 0
                ? styles.metricNegative
                : overallBalance.netBalance > 0
                ? styles.metricPositive
                : null,
            ]}>
            {formatSignedBalance(overallBalance.netBalance)}
          </Text>
          <View style={styles.metricLabelRow}>
            <Text style={[styles.metricLabel, isDark && styles.metricLabelDark]}>
              {netOutstandingLabel}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
};

export default React.memo(LedgerSummaryHeader);
