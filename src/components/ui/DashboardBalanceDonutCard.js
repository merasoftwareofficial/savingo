import React from 'react';
import {View, Text, StyleSheet, Pressable} from 'react-native';
import Svg, {Circle} from 'react-native-svg';
import Icon from 'react-native-vector-icons/Ionicons';
import {useTheme} from '../../context/ThemeContext';
import {radius, spacing, typography} from '../../utils/theme';
import {getNetBalanceLabel} from '../../utils/dashboardNetBalance';
import {useCountUp} from '../../hooks/useCountUp';

const DONUT_SIZE = 124;
const STROKE_WIDTH = 14;
const RADIUS = (DONUT_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const SEGMENT_GAP = 4;

// Hero block of the dashboard: net balance + period chip, donut on the left, legend on the right.
const DashboardBalanceDonutCard = ({
  balanceAmount = 0,
  earningAmount = 0,
  expenseAmount = 0,
  earningRemainingPercent = 0,
  segments = [],
  formatAmount,
  formatBalanceAmount,
  periodLabel,
  onPeriodPress,
}) => {
  const {colors} = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const resolvedBalanceAmount = Number(balanceAmount) || 0;
  const animatedBalance = useCountUp(resolvedBalanceAmount);
  const resolvedBalanceLabel = getNetBalanceLabel(resolvedBalanceAmount);
  const savingsAmount = Number(
    (Array.isArray(segments) ? segments : []).find(segment => segment?.key === 'saving-cut')?.value || 0,
  );

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

  const legend = [
    {key: 'earning', label: 'Earning', color: colors.success, value: earningAmount},
    {key: 'expenses', label: 'Expenses', color: colors.error, value: expenseAmount},
    ...(savingsAmount > 0
      ? [{key: 'savings', label: 'Savings', color: colors.warning, value: savingsAmount}]
      : []),
  ];

  return (
    <View>
      <View style={styles.topRow}>
        <View style={styles.balanceBlock}>
          <Text
            style={[
              styles.balanceLabel,
              resolvedBalanceAmount < 0 && styles.negative,
            ]}>
            {resolvedBalanceLabel}
          </Text>
          <Text
            style={[
              styles.balanceAmount,
              resolvedBalanceAmount < 0 && styles.negative,
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit>
            {renderAmount(
              animatedBalance === resolvedBalanceAmount
                ? resolvedBalanceAmount
                : Math.round(animatedBalance),
              true,
            )}
          </Text>
        </View>
        {periodLabel ? (
          <Pressable
            onPress={onPeriodPress}
            style={({pressed}) => [styles.periodChip, pressed && styles.periodChipPressed]}
            accessibilityRole="button"
            accessibilityLabel={`Change period, ${periodLabel}`}>
            <Icon name="time-outline" size={14} color={colors.text.secondary} />
            <Text style={styles.periodChipText} numberOfLines={1}>
              {periodLabel}
            </Text>
            <Icon name="chevron-down" size={14} color={colors.text.secondary} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.bodyRow}>
        <View style={styles.donutWrap}>
          <Svg width={DONUT_SIZE} height={DONUT_SIZE}>
            <Circle
              cx={DONUT_SIZE / 2}
              cy={DONUT_SIZE / 2}
              r={RADIUS}
              stroke={colors.surfaceMuted}
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
          <View style={styles.donutCenter} pointerEvents="none">
            <Text style={styles.donutPercent}>
              {`${Math.max(0, Math.round(Number(earningRemainingPercent) || 0))}%`}
            </Text>
            <Text style={styles.donutCaption}>left</Text>
          </View>
        </View>

        <View style={styles.legend}>
          {legend.map(item => (
            <View key={item.key} style={styles.legendRow}>
              <View style={[styles.legendDot, {backgroundColor: item.color}]} />
              <View style={styles.legendText}>
                <Text style={styles.legendLabel}>{item.label}</Text>
                <Text style={styles.legendValue} numberOfLines={1} adjustsFontSizeToFit>
                  {renderAmount(item.value)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
};

const createStyles = colors =>
  StyleSheet.create({
    topRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    balanceBlock: {
      flex: 1,
    },
    balanceLabel: {
      ...typography.overline,
      color: colors.text.secondary,
    },
    balanceAmount: {
      ...typography.display,
      color: colors.text.primary,
      marginTop: 4,
    },
    negative: {
      color: colors.error,
    },
    periodChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceMuted,
      maxWidth: 150,
    },
    periodChipPressed: {
      opacity: 0.7,
    },
    periodChipText: {
      ...typography.caption,
      fontWeight: '600',
      color: colors.text.primary,
      flexShrink: 1,
    },
    bodyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: spacing.md + 4,
      gap: spacing.lg,
    },
    donutWrap: {
      width: DONUT_SIZE,
      height: DONUT_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
    },
    donutCenter: {
      position: 'absolute',
      alignItems: 'center',
    },
    donutPercent: {
      ...typography.heading,
      color: colors.text.primary,
    },
    donutCaption: {
      ...typography.caption,
      color: colors.text.secondary,
    },
    legend: {
      flex: 1,
      gap: spacing.md,
    },
    legendRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    legendDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      marginRight: spacing.sm + 2,
    },
    legendText: {
      flex: 1,
    },
    legendLabel: {
      ...typography.caption,
      color: colors.text.secondary,
    },
    legendValue: {
      ...typography.bodyStrong,
      color: colors.text.primary,
    },
  });

export default React.memo(DashboardBalanceDonutCard);
