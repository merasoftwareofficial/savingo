import React from 'react';
import {Text, View} from 'react-native';
import {getLedgerNetOutstandingLabel} from '../../utils/ledgerBalanceLabel';

const LedgerMetricsBar = ({styles, balance, formatCurrency, formatSignedBalance}) => (
  <View style={styles.metricsSection}>
    <View style={styles.metricsRow}>
      <View style={styles.metricColumn}>
        <Text style={[styles.metricValue, styles.metricNegative]}>
          {formatCurrency(balance.totalPaid)}
        </Text>
        <View style={styles.metricLabelRow}>
          <Text style={styles.metricLabel}>Total Paid</Text>
        </View>
      </View>
      <View style={styles.metricDivider} />
      <View style={styles.metricColumn}>
        <Text style={[styles.metricValue, styles.metricPositive]}>
          {formatCurrency(balance.totalGet)}
        </Text>
        <View style={styles.metricLabelRow}>
          <Text style={styles.metricLabel}>Total Received</Text>
        </View>
      </View>
      <View style={styles.metricDivider} />
      <View style={styles.metricColumn}>
        <Text
          style={[
            styles.metricValue,
            balance.netBalance > 0
              ? styles.metricPositive
              : balance.netBalance < 0
              ? styles.metricNegative
              : null,
          ]}>
          {formatSignedBalance(balance.netBalance)}
        </Text>
        <View style={styles.metricLabelRow}>
          <Text style={styles.metricLabel}>
            {getLedgerNetOutstandingLabel(balance?.netBalance)}
          </Text>
        </View>
      </View>
    </View>
  </View>
);

export default React.memo(LedgerMetricsBar);
