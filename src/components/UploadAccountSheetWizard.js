import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  DeviceEventEmitter,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import RNFS from 'react-native-fs';
import {
  pick,
  types as docTypes,
  keepLocalCopy,
  isErrorWithCode,
  errorCodes,
} from '@react-native-documents/picker';
import ToggleSwitch from './ui/ToggleSwitch';
import {spacing, fontSize, fontWeight} from '../utils/theme';
import {useTheme} from '../context/ThemeContext';
import {useToast} from '../hooks/useToast';
import {getStrictEcoSnapshot} from '../services/strictEcoService';
import {
  ACCOUNT_SHEET_HEADERS,
  analyzeAccountSheet,
  createMissingAccountsForSheet,
  importAccountSheetEntries,
} from '../services/accountSheetUploadService';

const STEPS = {
  INFO: 'info',
  PREVIEW: 'preview',
  RESULT: 'result',
};
const DASHBOARD_DATA_CHANGED_EVENT = 'dashboard:dataChanged';
const waitForNextFrame = () =>
  new Promise(resolve => {
    requestAnimationFrame(() => resolve());
  });

const UploadAccountSheetWizard = ({visible, onClose}) => {
  const {colors} = useTheme();
  const {showToast} = useToast();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [step, setStep] = useState(STEPS.INFO);
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [creatingAccounts, setCreatingAccounts] = useState(false);
  const [recheckingSheet, setRecheckingSheet] = useState(false);
  const [finalizingResult, setFinalizingResult] = useState(false);
  const [strictEcoEnabled, setStrictEcoEnabled] = useState(true);
  const [relaxedMode, setRelaxedMode] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [importSummary, setImportSummary] = useState(null);
  const [accountCreateSummary, setAccountCreateSummary] = useState(null);
  const [pickerError, setPickerError] = useState('');

  const reset = useCallback(() => {
    setStep(STEPS.INFO);
    setSelectedFile(null);
    setAnalysis(null);
    setImportSummary(null);
    setAccountCreateSummary(null);
    setRecheckingSheet(false);
    setFinalizingResult(false);
    setPickerError('');
    setRelaxedMode(false);
  }, []);

  useEffect(() => {
    if (!visible) {
      reset();
      return;
    }
    getStrictEcoSnapshot()
      .then(snapshot => {
        setStrictEcoEnabled(Boolean(snapshot?.enabled));
      })
      .catch(() => {
        setStrictEcoEnabled(true);
      });
  }, [visible, reset]);

  const analyzePath = useCallback(
    async (localPath, fileName) => {
      const csvText = await RNFS.readFile(localPath, 'utf8');
      const result = analyzeAccountSheet(csvText, {
        strictEcoEnabled: strictEcoEnabled && !relaxedMode,
      });
      setSelectedFile({name: fileName, path: localPath});
      setAnalysis(result);
      setStep(STEPS.PREVIEW);
      return result;
    },
    [strictEcoEnabled, relaxedMode]
  );

  const chooseAndAnalyzeFile = useCallback(async () => {
    setAnalyzing(true);
    setPickerError('');
    try {
      const [picked] = await pick({
        mode: 'import',
        type: [docTypes.csv].flat(),
        allowMultiSelection: false,
      });
      const pickedName = String(picked?.name || 'selected-file.csv');
      let localPath = String(picked?.uri || '').replace('file://', '');
      if (!localPath) {
        throw new Error('Unable to read selected file.');
      }
      const hasDirectAccess = await RNFS.exists(localPath);
      if (!hasDirectAccess) {
        const copied = await keepLocalCopy({
          destination: 'cachesDirectory',
          files: [{uri: picked.uri, fileName: pickedName}],
        });
        const copyResult = copied?.[0];
        if (!copyResult || copyResult.status !== 'success') {
          throw new Error('Unable to access selected file.');
        }
        localPath = String(copyResult.localUri || '').replace('file://', '');
      }
      setImportSummary(null);
      setAccountCreateSummary(null);
      await analyzePath(localPath, pickedName);
    } catch (error) {
      if (isErrorWithCode(error) && error.code === errorCodes.OPERATION_CANCELED) {
        return;
      }
      setPickerError(error?.message || 'Failed to read selected file.');
    } finally {
      setAnalyzing(false);
    }
  }, [analyzePath]);

  const createMissingAccountsAndReanalyze = useCallback(async () => {
    const missingAccounts = analysis?.missingAccounts || [];
    if (missingAccounts.length === 0) {
      return;
    }
    if (!selectedFile?.path) {
      showToast('Please choose the sheet again.', 'error', 3000);
      return;
    }

      setCreatingAccounts(true);
      await waitForNextFrame();
      try {
      const summary = await createMissingAccountsForSheet(missingAccounts);
      setAccountCreateSummary(summary);

      if (summary.createdCount > 0) {
        DeviceEventEmitter.emit(DASHBOARD_DATA_CHANGED_EVENT, {
          source: 'account-sheet-missing-accounts',
          createdAccounts: summary.createdCount,
          at: Date.now(),
        });
        showToast(`${summary.createdCount} accounts created.`, 'success', 3000);
      }
      if (summary.failedCount > 0) {
        showToast(`${summary.failedCount} accounts could not be created.`, 'error', 3500);
      }

      setCreatingAccounts(false);
      setRecheckingSheet(true);
      const refreshed = await analyzePath(selectedFile.path, selectedFile.name);
      if ((refreshed?.missingAccounts?.length || 0) === 0 && summary.failedCount === 0) {
        showToast('All required accounts are now available.', 'success', 2600);
      }
    } catch (error) {
      showToast(error?.message || 'Failed to create missing accounts.', 'error', 3000);
    } finally {
      setCreatingAccounts(false);
      setRecheckingSheet(false);
    }
  }, [analysis, analyzePath, selectedFile, showToast]);

  const runImport = useCallback(
    async allowEcoViolations => {
      if (!analysis?.headerValid) {
        showToast('Sheet format is invalid.', 'error', 3000);
        return;
      }
      if ((analysis?.missingAccounts?.length || 0) > 0) {
        showToast('Create missing accounts first.', 'error', 3000);
        return;
      }
      const invalidCount = analysis?.invalidRows?.length || 0;
      if (invalidCount > 0) {
        showToast('Fix invalid rows before creating entries.', 'error', 3000);
        return;
      }

      setImporting(true);
      await waitForNextFrame();
      try {
        const summary = await importAccountSheetEntries(analysis, {
          allowEcoViolations,
        });
        setImporting(false);
        setFinalizingResult(true);
        setImportSummary(summary);
        await new Promise(resolve => setTimeout(resolve, 400));
        setStep(STEPS.RESULT);
        setFinalizingResult(false);

        if (summary.createdCount > 0) {
          DeviceEventEmitter.emit(DASHBOARD_DATA_CHANGED_EVENT, {
            source: 'account-sheet-import',
            createdCount: summary.createdCount,
            at: Date.now(),
          });
          showToast(`${summary.createdCount} entries created.`, 'success', 3000);
        } else if (summary.duplicateCount > 0 && summary.failedCount === 0) {
          showToast('No new entries created. All rows were duplicates.', 'info', 3200);
        } else {
          showToast('No entries were created.', 'info', 2600);
        }

        if (summary.failedCount > 0) {
          showToast(`${summary.failedCount} rows failed during import.`, 'error', 3500);
        }
      } catch (error) {
        showToast(error?.message || 'Failed to create entries.', 'error', 3000);
      } finally {
        setImporting(false);
        setFinalizingResult(false);
      }
    },
    [analysis, showToast]
  );

  const renderInfoStep = () => (
    <View>
      <View style={styles.heroCard}>
        <Text style={styles.heroTitle}>Dashboard Entries Upload</Text>
        <Text style={styles.heroText}>
          This sheet is for dashboard account entries only. Ledger entries are not uploaded from this flow.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Required columns</Text>
      <View style={styles.chipsWrap}>
        {ACCOUNT_SHEET_HEADERS.map(item => (
          <View key={item} style={styles.chip}>
            <Text style={styles.chipText}>{item}</Text>
          </View>
        ))}
      </View>

      <View style={styles.modeRow}>
        <View style={styles.modeTextWrap}>
          <Text style={styles.modeLabel}>Relaxed check for this upload</Text>
          <Text style={styles.modeHint}>Enable only if ECO timeline violations block your sheet.</Text>
        </View>
        <ToggleSwitch
          value={relaxedMode}
          onValueChange={setRelaxedMode}
        />
      </View>

      <TouchableOpacity
        style={styles.primaryBtn}
        onPress={chooseAndAnalyzeFile}
        disabled={analyzing}
        activeOpacity={0.85}>
        {analyzing ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <Icon name="document-attach-outline" size={18} color={colors.onPrimary} />
        )}
        <Text style={styles.primaryBtnText}>
          {analyzing ? 'Reading Sheet...' : 'Choose Excel/CSV Sheet'}
        </Text>
      </TouchableOpacity>
      {pickerError ? <Text style={styles.errorText}>{pickerError}</Text> : null}
    </View>
  );

  const renderPreviewStep = () => {
    const totalRows = analysis?.totalRows || 0;
    const invalidCount = analysis?.invalidRows?.length || 0;
    const ecoViolationCount = analysis?.ecoViolations?.length || 0;
    const missingCount = analysis?.missingAccounts?.length || 0;
    const validCount = Math.max(0, (analysis?.validRows?.length || 0) - ecoViolationCount);
    const canCreateSafe =
      invalidCount === 0 && missingCount === 0 && validCount > 0 && !importing && !creatingAccounts;
    const canCreateWithEco =
      invalidCount === 0 &&
      missingCount === 0 &&
      (analysis?.validRows?.length || 0) > 0 &&
      !importing &&
      !creatingAccounts;

    return (
      <View>
        <Text style={styles.sectionTitle}>Validation Preview</Text>
        <Text style={styles.mutedText}>{selectedFile?.name || ''}</Text>
        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Total</Text>
            <Text style={styles.metricValue}>{totalRows}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Valid</Text>
            <Text style={styles.metricValue}>{validCount}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Invalid</Text>
            <Text style={styles.metricValue}>{invalidCount + ecoViolationCount}</Text>
          </View>
        </View>

        {invalidCount > 0 ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Row errors</Text>
            {analysis.invalidRows.slice(0, 10).map(item => (
              <Text key={`invalid-${item.rowNo}`} style={styles.errorText}>
                Row {item.rowNo}: {item.reason}
              </Text>
            ))}
          </View>
        ) : null}

        {ecoViolationCount > 0 ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>ECO timeline alerts</Text>
            {analysis.ecoViolations.slice(0, 10).map(item => (
              <Text key={`eco-${item.rowNo}`} style={styles.errorText}>
                Row {item.rowNo} ({item.accountName}): {item.reason}
              </Text>
            ))}
          </View>
        ) : null}

        {missingCount > 0 ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Missing accounts</Text>
            <Text style={styles.mutedText}>
              Following accounts will be created first. Then entries will be uploaded.
            </Text>
            {analysis.missingAccounts.slice(0, 15).map(item => (
              <Text key={`${item.name}-${item.accountType}`} style={styles.mutedText}>
                {item.name} ({item.accountType})
              </Text>
            ))}
            <TouchableOpacity
              style={[styles.secondaryBtn, creatingAccounts ? styles.btnDisabled : null]}
              disabled={creatingAccounts || importing}
              onPress={createMissingAccountsAndReanalyze}
              activeOpacity={0.85}>
              {creatingAccounts ? (
                <ActivityIndicator color={colors.text.primary} />
              ) : (
                <Icon name="add-circle-outline" size={16} color={colors.text.primary} />
              )}
              <Text style={styles.secondaryBtnText}>
                {creatingAccounts ? 'Creating Accounts...' : 'Yes, Create Accounts and Continue'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.noteCard}>
          <Text style={styles.noteText}>
            Review this preview, then create entries in time order from oldest to newest.
          </Text>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.primaryBtn, !canCreateSafe ? styles.btnDisabled : null]}
            onPress={() => runImport(false)}
            disabled={!canCreateSafe}
            activeOpacity={0.85}>
            {importing ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Icon name="checkmark-circle-outline" size={18} color={colors.onPrimary} />
            )}
            <Text style={styles.primaryBtnText}>
              {importing ? 'Creating Entries...' : 'Create Valid Entries'}
            </Text>
          </TouchableOpacity>

          {ecoViolationCount > 0 ? (
            <TouchableOpacity
              style={[styles.secondaryBtn, !canCreateWithEco ? styles.btnDisabled : null]}
              disabled={!canCreateWithEco}
              onPress={() => {
                Alert.alert(
                  'Ignore ECO blocks?',
                  'This will create rows that ECO preview flagged as risky.',
                  [
                    {text: 'Cancel', style: 'cancel'},
                    {text: 'Create Anyway', style: 'destructive', onPress: () => runImport(true)},
                  ]
                );
              }}
              activeOpacity={0.85}>
              <Icon name="warning-outline" size={16} color={colors.text.primary} />
              <Text style={styles.secondaryBtnText}>Create and Ignore ECO Blocks</Text>
            </TouchableOpacity>
          ) : null}
        </View>

      </View>
    );
  };

  const renderResultStep = () => {
    const createdCount = importSummary?.createdCount || 0;
    const duplicateCount = importSummary?.duplicateCount || 0;
    const failedCount = importSummary?.failedCount || 0;
    const ecoSkippedCount = importSummary?.ecoSkippedCount || 0;
    const accountsCreatedCount = accountCreateSummary?.createdCount || 0;
    const statusText =
      createdCount > 0
        ? 'Entries were created successfully.'
        : 'Import completed with no new entries.';

    return (
      <View>
        <Text style={styles.sectionTitle}>Import Complete</Text>
        <Text style={styles.mutedText}>{statusText}</Text>
        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Created</Text>
            <Text style={styles.metricValue}>{createdCount}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Duplicates</Text>
            <Text style={styles.metricValue}>{duplicateCount}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Failed</Text>
            <Text style={styles.metricValue}>{failedCount}</Text>
          </View>
        </View>
        <View style={styles.block}>
          <Text style={styles.mutedText}>Accounts created: {accountsCreatedCount}</Text>
          <Text style={styles.mutedText}>Skipped by ECO: {ecoSkippedCount}</Text>
        </View>
        <TouchableOpacity style={styles.primaryBtn} onPress={onClose} activeOpacity={0.85}>
          <Icon name="checkmark-outline" size={18} color={colors.onPrimary} />
          <Text style={styles.primaryBtnText}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const title =
    step === STEPS.INFO
      ? 'Upload Account Sheet'
        : step === STEPS.PREVIEW
        ? 'Preview'
        : 'Result';
  const busyMessage = analyzing
    ? 'Reading sheet...'
    : creatingAccounts
      ? 'Creating missing accounts...'
      : recheckingSheet
        ? 'Re-checking sheet...'
        : importing
          ? 'Creating entries...'
          : finalizingResult
            ? 'Finalizing report...'
            : '';
  const isBusy = Boolean(busyMessage);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdrop}
          onPress={() => {
            if (!isBusy) {
              onClose();
            }
          }}
          activeOpacity={1}
        />
        <View style={styles.card}>
          <View style={styles.headerRow}>
            {step === STEPS.PREVIEW ? (
              <TouchableOpacity
                style={styles.headerIconBtn}
                onPress={() => setStep(STEPS.INFO)}
                disabled={isBusy}
                activeOpacity={0.85}>
                <Icon name="arrow-back" size={18} color={colors.text.primary} />
              </TouchableOpacity>
            ) : (
              <View style={styles.headerIconPlaceholder} />
            )}
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} disabled={isBusy}>
              <Icon name="close" size={20} color={colors.text.primary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {step === STEPS.INFO ? renderInfoStep() : null}
            {step === STEPS.PREVIEW ? renderPreviewStep() : null}
            {step === STEPS.RESULT ? renderResultStep() : null}
          </ScrollView>
          {isBusy ? (
            <View style={styles.loaderOverlay}>
              <View style={styles.loaderCard}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.loaderText}>{busyMessage}</Text>
              </View>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
};

const createStyles = colors =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'center',
      padding: spacing.md,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.overlay || 'rgba(0,0,0,0.45)',
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      maxHeight: '88%',
      overflow: 'hidden',
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: spacing.sm,
    },
    title: {
      flex: 1,
      fontSize: fontSize.large,
      fontWeight: fontWeight.semibold,
      color: colors.text.primary,
      textAlign: 'center',
    },
    headerIconBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted,
    },
    headerIconPlaceholder: {
      width: 32,
      height: 32,
    },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted,
    },
    body: {
      paddingHorizontal: spacing.md,
    },
    bodyContent: {
      paddingBottom: spacing.md,
      gap: spacing.sm,
    },
    heroCard: {
      marginTop: spacing.md,
      backgroundColor: colors.surfaceMuted,
      borderRadius: 12,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    heroTitle: {
      fontSize: fontSize.regular,
      fontWeight: fontWeight.semibold,
      color: colors.text.primary,
      marginBottom: 4,
    },
    heroText: {
      fontSize: fontSize.small,
      color: colors.text.secondary,
      lineHeight: 18,
    },
    sectionTitle: {
      marginTop: spacing.md,
      fontSize: fontSize.regular,
      fontWeight: fontWeight.semibold,
      color: colors.text.primary,
    },
    chipsWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: spacing.sm,
    },
    chip: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    chipText: {
      fontSize: 11,
      color: colors.text.secondary,
    },
    modeRow: {
      marginTop: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    modeTextWrap: {
      flex: 1,
    },
    modeLabel: {
      fontSize: fontSize.small,
      color: colors.text.primary,
      fontWeight: fontWeight.medium,
    },
    modeHint: {
      fontSize: 11,
      color: colors.text.secondary,
      marginTop: 2,
    },
    primaryBtn: {
      marginTop: spacing.md,
      backgroundColor: colors.primary,
      borderRadius: 10,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    primaryBtnText: {
      color: colors.onPrimary,
      fontSize: fontSize.regular,
      fontWeight: fontWeight.semibold,
    },
    mutedText: {
      fontSize: 12,
      color: colors.text.secondary,
      marginTop: 6,
    },
    errorText: {
      fontSize: 12,
      color: colors.error,
      marginTop: 6,
    },
    metricsRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: spacing.md,
    },
    metricCard: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: 10,
      paddingVertical: spacing.sm,
      alignItems: 'center',
    },
    metricLabel: {
      fontSize: 11,
      color: colors.text.secondary,
    },
    metricValue: {
      marginTop: 4,
      fontSize: fontSize.large,
      color: colors.text.primary,
      fontWeight: fontWeight.semibold,
    },
    block: {
      marginTop: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      backgroundColor: colors.surface,
      padding: spacing.sm,
    },
    blockTitle: {
      fontSize: fontSize.small,
      color: colors.text.primary,
      fontWeight: fontWeight.semibold,
      marginBottom: 4,
    },
    noteCard: {
      marginTop: spacing.md,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
      padding: spacing.sm,
    },
    noteText: {
      fontSize: 12,
      lineHeight: 18,
      color: colors.text.secondary,
    },
    actionRow: {
      marginTop: spacing.md,
      gap: spacing.sm,
    },
    secondaryBtn: {
      borderRadius: 10,
      minHeight: 42,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    secondaryBtnText: {
      color: colors.text.primary,
      fontSize: fontSize.small,
      fontWeight: fontWeight.medium,
    },
    btnDisabled: {
      opacity: 0.45,
    },
    loaderOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.2)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.md,
    },
    loaderCard: {
      minWidth: 220,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
    },
    loaderText: {
      fontSize: fontSize.small,
      color: colors.text.primary,
      fontWeight: fontWeight.medium,
      textAlign: 'center',
    },
  });

export default UploadAccountSheetWizard;
