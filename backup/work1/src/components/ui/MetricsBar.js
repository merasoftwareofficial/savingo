import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {spacing, fontWeight} from '../../utils/theme';
import {useTheme} from '../../context/ThemeContext';
import {useAdaptiveAccent} from '../../hooks/useAdaptiveThemeAccent';

const MetricsBar = ({
  earning = 0,
  expenses = 0,
  netBalance = 0,
  formatCurrencyRupee,
  accentPalette,
  themeColor = '#2563EB',
  labels,
}) => {
  const {colors} = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const fallbackAccent = useAdaptiveAccent(themeColor);
  const accent = accentPalette || fallbackAccent;
  const highlightTone = accent.accentSelection || accent.accentPrimary;
  const netColor =
    netBalance > 0
      ? highlightTone
      : netBalance < 0
      ? colors.error
      : colors.text.primary;
  const resolvedLabels = {
    earning: String(labels?.earning || 'Earning'),
    expenses: String(labels?.expenses || 'Expenses'),
    net:
      String(labels?.net || '').trim() ||
      (typeof labels?.getNetLabel === 'function'
        ? String(labels.getNetLabel(netBalance) || '').trim()
        : '') ||
      'Net Balance',
  };

  return (
    <View style={styles.row}>
      <View style={styles.col}>
        <Text
          style={[
            styles.value,
            {color: highlightTone},
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit>
          {formatCurrencyRupee(earning)}
        </Text>
        <Text style={styles.label}>{resolvedLabels.earning}</Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.col}>
        <Text
          style={[styles.value, {color: colors.error}]}
          numberOfLines={1}
          adjustsFontSizeToFit>
          {formatCurrencyRupee(expenses)}
        </Text>
        <Text style={styles.label}>{resolvedLabels.expenses}</Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.col}>
        <Text
          style={[styles.value, {color: netColor}]}
          numberOfLines={1}
          adjustsFontSizeToFit>
          {formatCurrencyRupee(netBalance)}
        </Text>
        <Text style={styles.label}>{resolvedLabels.net}</Text>
      </View>
    </View>
  );
};

const createStyles = colors => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderTopWidth: 0,
    backgroundColor: colors.card,
    shadowColor: '#000000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0,
    shadowRadius: 3,
    elevation: 0,
  },
  col: {
    flex: 1,
    alignItems: 'center',
  },
  value: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  label: {
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 2,
    fontWeight: fontWeight.medium,
  },
  divider: {
    width: 1,
    height: 22,
    backgroundColor: colors.border,
  },
});

export default MetricsBar;
