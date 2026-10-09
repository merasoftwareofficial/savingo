import React, {useState, useMemo, useEffect, useRef} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  PanResponder,
  Animated,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import BottomSheet from './BottomSheet';
import {spacing, fontWeight} from '../utils/theme';
import {getTransactionsByAccount} from '../services/transactionsDatabase';
import {useTheme} from '../context/ThemeContext';
import {useAdaptiveAccent} from '../hooks/useAdaptiveThemeAccent';

const DAYS_OF_WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const MONTHS_FULL = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const MONTHS_SHORT = [
  'Jan','Feb','Mar','Apr','May','Jun',
  'Jul','Aug','Sep','Oct','Nov','Dec',
];

const isTransferTxn = remark => {
  const r = String(remark || '').trim().toLowerCase();
  return (
    r.startsWith('transferred to ') ||
    r.startsWith('transferred from ') ||
    r.startsWith('requested to ') ||
    r.startsWith('requested from ') ||
    r.startsWith('requested by ')
  );
};

const formatDateLabel = ts => {
  if (!ts) return '—';
  const d = new Date(ts);
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
};

const getDaysInMonth = (month, year) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (month, year) => new Date(year, month, 1).getDay();

const makeDayStart = (year, month, day) =>
  new Date(year, month, day, 0, 0, 0, 0).getTime();
const makeDayEnd = (year, month, day) =>
  new Date(year, month, day, 23, 59, 59, 999).getTime();

const DashboardCalendarSheet = ({
  visible,
  onClose,
  onCustomDateRange,
  onClearAll,
  accounts,
  customStartDate,
  customEndDate,
  themeColor = '#16A34A',
  accentPalette,
}) => {
  const {colors} = useTheme();
  const fallbackAccent = useAdaptiveAccent(themeColor);
  const accent = accentPalette || fallbackAccent;
  const now = React.useMemo(() => new Date(), []);
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [tempStart, setTempStart] = useState(null);
  const [tempEnd, setTempEnd] = useState(null);
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    if (visible) {
      const currentNow = new Date();
      setTempStart(customStartDate || null);
      setTempEnd(customEndDate || null);
      setViewMonth(currentNow.getMonth());
      setViewYear(currentNow.getFullYear());
    }
  }, [visible, customStartDate, customEndDate]);

  // Per-date amounts for the displayed month
  const dateAmounts = useMemo(() => {
    const result = {};
    const daysInMonth = getDaysInMonth(viewMonth, viewYear);
    for (let d = 1; d <= daysInMonth; d++) {
      const dStart = makeDayStart(viewYear, viewMonth, d);
      const dEnd = makeDayEnd(viewYear, viewMonth, d);
      let earning = 0;
      let expense = 0;
      (accounts || []).forEach(acc => {
        const txns = getTransactionsByAccount(acc.id);
        txns.forEach(txn => {
          if (Number(txn.is_deleted) === 1) return;
          if (isTransferTxn(txn.remark)) return;
          const ts = Number(txn.transaction_date);
          if (ts >= dStart && ts <= dEnd) {
            const amt = Number(txn.amount) || 0;
            if (amt > 0) earning += amt;
            else expense += amt;
          }
        });
      });
      if (earning > 0 || expense < 0) {
        result[d] = {earning, expense};
      }
    }
    return result;
  }, [accounts, viewMonth, viewYear]);

  const handleDayPress = day => {
    const ts = makeDayStart(viewYear, viewMonth, day);
    const tsEnd = makeDayEnd(viewYear, viewMonth, day);
    if (!tempStart || (tempStart && tempEnd)) {
      setTempStart(ts);
      setTempEnd(null);
    } else {
      if (ts >= tempStart) {
        setTempEnd(tsEnd);
      } else {
        const oldStartEnd = makeDayEnd(
          new Date(tempStart).getFullYear(),
          new Date(tempStart).getMonth(),
          new Date(tempStart).getDate(),
        );
        setTempEnd(oldStartEnd);
        setTempStart(ts);
      }
    }
  };

  const slideAnim = useRef(new Animated.Value(0)).current;

  const slideToMonth = (direction, changeFn) => {
    const outX = direction === 'left' ? -300 : 300;
    const inX = direction === 'left' ? 300 : -300;
    Animated.timing(slideAnim, {
      toValue: outX,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      slideAnim.setValue(inX);
      changeFn();
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start();
    });
  };

  const prevMonth = () => {
    slideToMonth('right', () => {
      if (viewMonth === 0) {setViewMonth(11); setViewYear(y => y - 1);}
      else setViewMonth(m => m - 1);
    });
  };
  const nextMonth = () => {
    slideToMonth('left', () => {
      if (viewMonth === 11) {setViewMonth(0); setViewYear(y => y + 1);}
      else setViewMonth(m => m + 1);
    });
  };

  const swipeResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderRelease: (_, g) => {
        if (g.dx < -40) nextMonth();
        else if (g.dx > 40) prevMonth();
      },
    }),
  ).current;

  const handleApply = () => {
    if (tempStart && tempEnd) {
      onCustomDateRange(tempStart, tempEnd);
      onClose();
    }
  };

  const handleClear = () => {
    setTempStart(null);
    setTempEnd(null);
    if (typeof onClearAll === 'function') {
      onClearAll();
    }
  };

  const daysInMonth = getDaysInMonth(viewMonth, viewYear);
  const firstDay = getFirstDayOfMonth(viewMonth, viewYear);

  const renderCalendarCells = () => {
    const cells = [];
    for (let i = 0; i < firstDay; i++) {
      cells.push(<View key={`e-${i}`} style={styles.dayCell} />);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const ts = makeDayStart(viewYear, viewMonth, d);
      const tsEnd = makeDayEnd(viewYear, viewMonth, d);
      const isStart = tempStart !== null && ts === tempStart;
      const isEnd = tempEnd !== null && tsEnd === tempEnd;
      const inRange =
        tempStart && tempEnd && ts >= tempStart && tsEnd <= tempEnd;
      const isSelected = isStart || isEnd;
      const isToday =
        d === now.getDate() &&
        viewMonth === now.getMonth() &&
        viewYear === now.getFullYear();
      const amt = dateAmounts[d];

      cells.push(
        <TouchableOpacity
          key={d}
          style={styles.dayCell}
          onPress={() => handleDayPress(d)}
          activeOpacity={0.7}>
          <View
            style={[
              styles.dayCellBtn,
              isToday && !isSelected && styles.dayCellBtnToday,
              inRange &&
                !isSelected && {
                  backgroundColor: accent.accentPrimarySoft,
                  borderColor: accent.ring,
                },
              isSelected && {
                backgroundColor: accent.accentPrimary,
                borderColor: accent.ring,
              },
            ]}>
            <Text
              style={[
                styles.dayText,
                isToday && !isSelected && styles.dayTextToday,
                isSelected && styles.dayTextSelected,
              ]}>
              {d}
            </Text>
            {amt && amt.earning > 0 && (
              <Text style={styles.amtEarning}>+{Math.round(amt.earning)}</Text>
            )}
            {amt && amt.expense < 0 && (
              <Text
                style={[
                  styles.amtExpense,
                  isSelected && styles.amtExpenseSelected,
                ]}>
                {Math.round(amt.expense)}
              </Text>
            )}
          </View>
        </TouchableOpacity>,
      );
    }
    return cells;
  };

  const canApply = !!(tempStart && tempEnd);

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.content}>
      {/* Header */}
      <View style={styles.sheetHeader}>
        <Text style={styles.sheetTitle}>Select Date Range</Text>
        <TouchableOpacity onPress={onClose} style={styles.sheetCloseBtn}>
          <Icon name="close" size={20} color={colors.text.secondary} />
        </TouchableOpacity>
      </View>

      {/* Month nav */}
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={prevMonth} style={styles.monthNavBtn}>
          <Icon name="chevron-back" size={18} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.monthNavTitle}>
          {MONTHS_FULL[viewMonth]} {viewYear}
        </Text>
        <TouchableOpacity onPress={nextMonth} style={styles.monthNavBtn}>
          <Icon name="chevron-forward" size={18} color={colors.text.primary} />
        </TouchableOpacity>
      </View>

      {/* Week headers */}
      <View style={styles.weekRow}>
        {DAYS_OF_WEEK.map(day => (
          <View key={day} style={styles.weekCell}>
            <Text style={styles.weekText}>{day}</Text>
          </View>
        ))}
      </View>

      {/* Calendar grid */}
      <View style={styles.gridWrapper} {...swipeResponder.panHandlers}>
        <Animated.View style={[styles.grid, {transform: [{translateX: slideAnim}]}]}>
          {renderCalendarCells()}
        </Animated.View>
      </View>

      {/* Hint bar */}
      <View style={styles.hintBar}>
        <Icon name="information-circle-outline" size={13} color={colors.text.secondary} />
        <Text style={styles.hintText}>
          Tap start date, then end date{'  '}
          <Text style={styles.hintGreen}>● Earning</Text>
          {'  '}
          <Text style={styles.hintRed}>● Expense</Text>
        </Text>
      </View>

      {/* Footer — range + action buttons */}
      <View style={styles.footer}>
        <View style={styles.rangeBlock}>
          <Text style={styles.rangeBlockLabel}>FROM</Text>
          <Text style={styles.rangeBlockValue} numberOfLines={1}>
            {formatDateLabel(tempStart)}
          </Text>
        </View>
        <Icon name="arrow-forward" size={14} color={colors.text.light} />
        <View style={styles.rangeBlock}>
          <Text style={styles.rangeBlockLabel}>TO</Text>
          <Text style={styles.rangeBlockValue} numberOfLines={1}>
            {formatDateLabel(tempEnd)}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.footerBtnClear}
          onPress={handleClear}
          activeOpacity={0.8}>
          <Icon name="refresh-outline" size={18} color={colors.text.primary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.footerBtnApply,
            {backgroundColor: accent.accentPrimary},
            !canApply && styles.footerBtnDisabled,
          ]}
          onPress={handleApply}
          disabled={!canApply}>
          <Icon name="checkmark" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
      </View>
    </BottomSheet>
  );
};

const createStyles = colors => StyleSheet.create({
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    marginBottom: 4,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: fontWeight.bold,
    color: colors.text.primary,
  },
  sheetCloseBtn: {
    padding: 4,
  },

  // Hint
  hintBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 0,
  },
  hintText: {
    fontSize: 11,
    color: colors.text.secondary,
    flex: 1,
  },
  hintGreen: {color: '#16A34A'},
  hintRed: {color: colors.error},

  rangeBlock: {
    flex: 0,
    minWidth: 80,
  },
  rangeBlockLabel: {
    fontSize: 9,
    fontWeight: fontWeight.bold,
    color: colors.text.light,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  rangeBlockValue: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
    marginTop: 2,
  },

  // Month nav
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  monthNavBtn: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthNavTitle: {
    fontSize: 15,
    fontWeight: fontWeight.bold,
    color: colors.text.primary,
  },

  // Week headers
  weekRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  weekCell: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    paddingVertical: 2,
  },
  weekText: {
    fontSize: 10,
    fontWeight: fontWeight.semibold,
    color: colors.text.light,
  },

  // Calendar grid
  gridWrapper: {
    overflow: 'hidden',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    padding: 2,
  },
  dayCellBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 48,
  },
  dayCellBtnToday: {
    backgroundColor: colors.panelMuted,
    borderColor: colors.primary,
  },
  dayText: {
    fontSize: 12,
    fontWeight: fontWeight.medium,
    color: colors.text.primary,
  },
  dayTextToday: {
    color: colors.primary,
    fontWeight: fontWeight.bold,
  },
  dayTextSelected: {
    color: '#FFFFFF',
    fontWeight: fontWeight.bold,
  },
  amtEarning: {
    fontSize: 8,
    color: '#16A34A',
    fontWeight: fontWeight.semibold,
    marginTop: 1,
    textAlign: 'center',
  },
  amtExpense: {
    fontSize: 8,
    color: colors.error,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
  amtExpenseSelected: {
    color: 'rgba(255,255,255,0.85)',
  },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 6,
  },
  footerBtnClear: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBtnApply: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBtnDisabled: {
    opacity: 0.4,
  },
  footerBtnClearText: {
    fontSize: 14,
    fontWeight: fontWeight.bold,
    color: colors.text.primary,
  },
});

export default DashboardCalendarSheet;
