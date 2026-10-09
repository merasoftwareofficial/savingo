import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import Svg, {Circle} from 'react-native-svg';
import {useTheme} from '../../context/ThemeContext';
import {fontWeight, spacing} from '../../utils/theme';
import {withAlpha} from '../../utils/headerTextureTheme';
import {getNetBalanceLabel} from '../../utils/dashboardNetBalance';

const DONUT_SIZE = 132;
const STROKE_WIDTH = 18;
const RADIUS = (DONUT_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const SEGMENT_GAP = 4;

const DashboardBalanceDonutCard = ({
  balanceAmount = 0,
  earningAmount = 0,
  expenseAmount = 0,
  earningRemainingPercent = 0,
  segments = [],
  formatAmount,
  formatBalanceAmount,
}) => {
  const {colors, isDark} = useTheme();
  const styles = React.useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const resolvedBalanceAmount = Number(balanceAmount) || 0;
  const resolvedBalanceLabel = getNetBalanceLabel(resolvedBalanceAmount);

  const normalizedSegments = React.useMemo(() => {
    const safeSegments = Array.isArray(segments)
      ? segments.filter(segment => Number(segment?.value) > 0)
      : [];
    const total = safeSegments.reduce(
      (sum, segment) => sum + (Number(segment?.value) || 0),
      0,
    );

    if (total <= 0) {
      return [];
    }

    let consumedLength = 0;
    return safeSegments.map(segment => {
      const rawLength = (CIRCUMFERENCE * Number(segment.value || 0)) / total;
      const paintedLength = Math.max(0, rawLength - SEGMENT_GAP);
      const result = {
        key: String(segment?.key || consumedLength),
        color: segment?.color || colors.border,
        dashArray: `${paintedLength} ${CIRCUMFERENCE}`,
        dashOffset: -consumedLength,
      };
      consumedLength += rawLength;
      return result;
    });
  }, [colors.border, segments]);

  const renderAmount = (value, useBalanceFormatter = false) => {
    const formatter = useBalanceFormatter && typeof formatBalanceAmount === 'function'
      ? formatBalanceAmount
      : formatAmount;
    if (typeof formatter === 'function') {
      return formatter(value);
    }
    return String(value);
  };

  return (
    <View style={styles.card}>
      <Text
        style={[
          styles.balanceLabel,
          resolvedBalanceAmount < 0 && styles.balanceLabelNegative,
        ]}>
        {resolvedBalanceLabel}
      </Text>
      <Text
        style={[
          styles.balanceAmount,
          resolvedBalanceAmount < 0 && styles.balanceAmountNegative,
        ]}>
        {renderAmount(resolvedBalanceAmount, true)}
      </Text>

      <View style={styles.donutWrap}>
        <View style={styles.donutSurface}>
          <Svg width={DONUT_SIZE} height={DONUT_SIZE}>
            <Circle
              cx={DONUT_SIZE / 2}
              cy={DONUT_SIZE / 2}
              r={RADIUS}
              stroke={isDark ? withAlpha(colors.white, 0.14) : withAlpha(colors.black, 0.08)}
              strokeWidth={STROKE_WIDTH}
              fill="none"
            />
            {normalizedSegments.map(segment => (
              <Circle
                key={segment.key}
                cx={DONUT_SIZE / 2}
                cy={DONUT_SIZE / 2}
                r={RADIUS}
                stroke={segment.color}
                strokeWidth={STROKE_WIDTH}
                strokeLinecap="round"
                strokeDasharray={segment.dashArray}
                strokeDashoffset={segment.dashOffset}
                fill="none"
                rotation="-90"
                origin={`${DONUT_SIZE / 2}, ${DONUT_SIZE / 2}`}
              />
            ))}
          </Svg>
          <View style={styles.donutInner}>
            <Text style={styles.donutInnerLabel}>
              {`${Math.max(0, Math.round(Number(earningRemainingPercent) || 0))}%`}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.footerRow}>
        <View style={styles.metricBlock}>
          <Text style={styles.earningLabel}>Earning</Text>
          <Text style={styles.metricAmount}>{renderAmount(earningAmount)}</Text>
        </View>
        <View style={styles.metricBlockRight}>
          <Text style={styles.expenseLabel}>Expenses</Text>
          <Text style={styles.metricAmount}>{renderAmount(expenseAmount)}</Text>
        </View>
      </View>
    </View>
  );
};

const createStyles = (colors, isDark) =>
  StyleSheet.create({
    card: {
      marginBottom: spacing.lg,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      borderRadius: 24,
      backgroundColor: isDark ? withAlpha(colors.white, 0.04) : withAlpha(colors.black, 0.025),
      borderWidth: 1,
      borderColor: isDark ? withAlpha(colors.white, 0.08) : withAlpha(colors.black, 0.05),
    },
    balanceLabel: {
      textAlign: 'center',
      fontSize: 12,
      color: colors.text.secondary,
      fontWeight: fontWeight.semibold,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      marginBottom: 4,
    },
    balanceLabelNegative: {
      color: colors.error,
    },
    balanceAmount: {
      textAlign: 'center',
      fontSize: 28,
      color: colors.text.primary,
      fontWeight: fontWeight.bold,
      marginBottom: spacing.md,
    },
    balanceAmountNegative: {
      color: colors.error,
    },
    donutWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md,
    },
    donutSurface: {
      width: DONUT_SIZE + 16,
      height: DONUT_SIZE + 16,
      borderRadius: (DONUT_SIZE + 16) / 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? withAlpha(colors.white, 0.03) : withAlpha(colors.black, 0.03),
      borderWidth: 1,
      borderColor: isDark ? withAlpha(colors.white, 0.07) : withAlpha(colors.black, 0.06),
    },
    donutInner: {
      position: 'absolute',
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? colors.panel : colors.surface,
      borderWidth: 1,
      borderColor: isDark ? withAlpha(colors.white, 0.08) : withAlpha(colors.black, 0.08),
    },
    donutInnerLabel: {
      fontSize: 18,
      color: colors.text.secondary,
      fontWeight: fontWeight.semibold,
    },
    footerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingHorizontal: spacing.xs,
    },
    metricBlock: {
      flex: 1,
      alignItems: 'flex-start',
    },
    metricBlockRight: {
      flex: 1,
      alignItems: 'flex-end',
    },
    earningLabel: {
      fontSize: 12,
      color: '#16A34A',
      fontWeight: fontWeight.semibold,
      marginBottom: 4,
    },
    expenseLabel: {
      fontSize: 12,
      color: '#EF4444',
      fontWeight: fontWeight.semibold,
      marginBottom: 4,
    },
    metricAmount: {
      fontSize: 18,
      color: colors.text.primary,
      fontWeight: fontWeight.bold,
    },
  });

export default React.memo(DashboardBalanceDonutCard);
