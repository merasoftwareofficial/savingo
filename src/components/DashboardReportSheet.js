import React, {useState, useEffect} from 'react';
import {useCurrencySymbol} from '../hooks/useCurrencySymbol';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import RNBlobUtil from 'react-native-blob-util';
import Share from 'react-native-share';
import BottomSheet from './BottomSheet';
import DashboardCalendarSheet from './DashboardCalendarSheet';
import Button from './ui/Button';
import {spacing, fontSize, fontWeight} from '../utils/theme';
import {
  buildReportData,
  buildCsvExportData,
  generateImportReadyCSVReport,
} from '../services/reportsystem';
import {generateReportPdfFile} from '../services/reportPdf';
import {useTheme} from '../context/ThemeContext';
import {useAppAlert} from '../context/AppAlertContext';
import {readCachedSessionUser} from '../services/sessionService';

const FORMATS = [
  {label: 'PDF', value: 'pdf', icon: 'document-text-outline'},
  {label: 'Excel', value: 'excel', icon: 'grid-outline'},
];

const PERIODS = [
  {label: 'Weekly',  value: 'weekly'},
  {label: 'Monthly', value: 'monthly'},
  {label: 'Yearly',  value: 'yearly'},
  {label: 'Custom',  value: 'custom'},
];

const fmtDate = ts =>
  ts
    ? new Date(ts).toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: 'numeric'})
    : 'Select';

const DashboardReportSheet = ({
  visible,
  onClose,
  accounts = [],
}) => {
  const {colors} = useTheme();
  const {showAlert} = useAppAlert();
  const themedAlert = React.useCallback((title, message, actions) => {
    const safeActions =
      Array.isArray(actions) && actions.length
        ? actions.map(action => ({
            text: String(action?.text || 'OK'),
            style: action?.style || 'default',
            onPress: action?.onPress,
          }))
        : [{text: 'OK'}];
    showAlert({
      title: String(title || ''),
      message: String(message || ''),
      actions: safeActions,
    });
  }, [showAlert]);
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [format, setFormat]               = useState('pdf');
  const [period, setPeriod]               = useState('monthly');
  const [customStart, setCustomStart]     = useState(null);
  const [customEnd, setCustomEnd]         = useState(null);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [generating, setGenerating]       = useState(false);
  const [countryCode, setCountryCode]     = useState(null);
  const currencySymbol                     = useCurrencySymbol();

  useEffect(() => {
    readCachedSessionUser()
      .then(u => {
        if (u?.countryCode) setCountryCode(u.countryCode);
      })
      .catch(() => {});
  }, []);

  const canGenerate =
    period !== 'custom' || (!!customStart && !!customEnd);

  const handleShareReport = async () => {
    if (!canGenerate) return;
    setGenerating(true);
    try {
      if (format === 'pdf') {
        const data = buildReportData(accounts, period, customStart, customEnd);
        if (!data || data.summary.txnCount === 0) {
          themedAlert('No Data', 'No transactions found for the selected period.');
          return;
        }
        const filePath = await generateReportPdfFile(data, currencySymbol, countryCode);
        const pdfUrl = filePath.startsWith('file://') ? filePath : 'file://' + filePath;
        await Share.open({url: pdfUrl, type: 'application/pdf', failOnCancel: false});
      } else {
        const csvData = buildCsvExportData(
          accounts,
          period,
          customStart,
          customEnd
        );
        const csvRows = Array.isArray(csvData?.rows) ? csvData.rows : [];
        if (csvRows.length === 0) {
          themedAlert('No Data', 'No transactions found for the selected period.');
          return;
        }
        const csv = generateImportReadyCSVReport(
          csvData,
          currencySymbol,
          countryCode
        );
        const path = `${RNBlobUtil.fs.dirs.CacheDir}/report_${Date.now()}.csv`;
        await RNBlobUtil.fs.writeFile(path, csv, 'utf8');
        await Share.open({
          url: 'file://' + path,
          type: 'text/csv',
          failOnCancel: false,
        });
      }
    } catch (e) {
      if (String(e?.message || '').toLowerCase().includes('did not share')) {
        return;
      }
      themedAlert('Error', String(e?.message || e));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <BottomSheet
        visible={visible}
        onClose={onClose}
        title="Share report"
        subtitle="Export your transactions as PDF or CSV">

        {/* Format */}
        <Text style={styles.sectionLabel}>Format</Text>
        <View style={styles.formatRow}>
          {FORMATS.map(f => (
            <TouchableOpacity
              key={f.value}
              style={[
                styles.formatBtn,
                format === f.value && styles.selectedFill,
              ]}
              onPress={() => setFormat(f.value)}
              activeOpacity={0.8}>
              <Icon
                name={f.icon}
                size={18}
                color={format === f.value ? colors.onPrimary : colors.text.primary}
              />
              <Text style={[styles.formatBtnText, format === f.value && styles.formatBtnTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Period */}
        <Text style={styles.sectionLabel}>Period</Text>
        <View style={styles.periodRow}>
          {PERIODS.map(p => (
            <TouchableOpacity
              key={p.value}
              style={[
                styles.periodChip,
                period === p.value && styles.selectedFill,
              ]}
              onPress={() => setPeriod(p.value)}
              activeOpacity={0.8}>
              <Text style={[styles.periodChipText, period === p.value && styles.periodChipTextActive]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Custom date range */}
        {period === 'custom' && (
          <TouchableOpacity
            style={styles.customDateRow}
            onPress={() => setCalendarVisible(true)}
            activeOpacity={0.8}>
            <View style={styles.customDateBlock}>
              <Text style={styles.customDateLabel}>FROM</Text>
              <Text style={[styles.customDateValue, !customStart && styles.customDatePlaceholder]}>
                {fmtDate(customStart)}
              </Text>
            </View>
            <Icon name="arrow-forward" size={14} color={colors.text.light} />
            <View style={styles.customDateBlock}>
              <Text style={styles.customDateLabel}>TO</Text>
              <Text style={[styles.customDateValue, !customEnd && styles.customDatePlaceholder]}>
                {fmtDate(customEnd)}
              </Text>
            </View>
            <Icon
              name="calendar-outline"
              size={18}
              color={colors.text.primary}
            />
          </TouchableOpacity>
        )}

        <View style={styles.divider} />

        {/* Share button */}
        <Button
          label={generating ? 'Preparing report...' : 'Share report'}
          icon="share-social-outline"
          onPress={handleShareReport}
          disabled={!canGenerate || generating}
          loading={generating}
          haptic
          style={styles.generateBtn}
        />
      </BottomSheet>

      {/* Calendar for custom range */}
      <DashboardCalendarSheet
        visible={calendarVisible}
        onClose={() => setCalendarVisible(false)}
        onCustomDateRange={(start, end) => {
          setCustomStart(start);
          setCustomEnd(end);
          setCalendarVisible(false);
        }}
        onClearAll={() => {
          setCustomStart(null);
          setCustomEnd(null);
        }}
        accounts={accounts}
        customStartDate={customStart}
        customEndDate={customEnd}
      />
    </>
  );
};

const createStyles = colors => StyleSheet.create({
  sectionLabel: {
    fontSize: 11,
    fontWeight: fontWeight.semibold,
    color: colors.text.light,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  formatRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  formatBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  formatBtnText: {
    fontSize: fontSize.medium,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
  },
  formatBtnTextActive: {
    color: colors.onPrimary,
  },
  selectedFill: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  periodRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
    paddingHorizontal: spacing.md,
  },
  periodChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  periodChipText: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
  },
  periodChipTextActive: {
    color: colors.onPrimary,
  },
  customDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginHorizontal: spacing.md,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  customDateBlock: {
    flex: 1,
  },
  customDateLabel: {
    fontSize: 9,
    fontWeight: fontWeight.bold,
    color: colors.text.light,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  customDateValue: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
    marginTop: 2,
  },
  customDatePlaceholder: {
    color: colors.text.light,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
    marginHorizontal: spacing.md,
  },
  generateBtn: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
});

export default DashboardReportSheet;

