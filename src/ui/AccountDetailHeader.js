import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import TexturedSurface from '../components/TexturedSurface';
import DashboardPeriodFilter from '../components/DashboardPeriodFilter';
import ManualBackupButton from '../components/ManualBackupButton';
import {useTheme} from '../context/ThemeContext';
import {spacing, fontSize, fontWeight} from '../utils/theme';

// Sticky header shared by the account detail screens (earning / expenses / saving / credit).
// Neutral light/dark surface; only the account's own icon keeps its colour.
const AccountDetailHeader = ({
  insets,
  account,
  handleBackNavigation,
  handleStickyHeaderLayout,
  accountTypeLabel,
  renderAccountHeaderIcon,
  menuButtonRef,
  openAccountMenu,
  handleOpenPersonalize,
  quickPeriod,
  handleQuickPeriodSelect,
  customStartDate,
  customEndDate,
  handleCustomDateRange,
  handleClearDateRange,
  monthStartDay,
  filteredAdded,
  filteredWithdrawals,
  totalBalance,
  formatCurrency,
  metricsLabels,
}) => {
  const {colors} = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const accountIconColor = account?.icon_color || colors.headerIcon;

  return (
    <View style={styles.stickyHeader} onLayout={handleStickyHeaderLayout}>
      <TexturedSurface style={[styles.header, {paddingTop: spacing.sm + insets.top}]}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity onPress={handleBackNavigation} style={styles.backButton}>
            <Icon name="chevron-back" size={22} color={colors.headerIcon} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleOpenPersonalize}
            style={styles.accountAvatarTap}
            activeOpacity={0.85}>
            <View style={styles.accountAvatar}>
              {renderAccountHeaderIcon(account?.icon, 28, accountIconColor)}
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleOpenPersonalize}
            style={styles.headerTitleBlock}
            activeOpacity={0.85}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {account.account_name}
            </Text>
            <View style={styles.headerMetaPill}>
              <Text style={styles.headerSubtitle}>{accountTypeLabel}</Text>
            </View>
          </TouchableOpacity>
          <View style={styles.headerActions}>
            <ManualBackupButton
              style={styles.backupButton}
              iconWrapperStyle={styles.backupIconWrapper}
              spinnerStyle={styles.backupSpinner}
              iconColor={colors.headerIcon}
            />
            <View ref={menuButtonRef} collapsable={false}>
              <TouchableOpacity onPress={openAccountMenu} style={styles.menuButton}>
                <Icon name="ellipsis-vertical" size={22} color={colors.headerIcon} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </TexturedSurface>
      <DashboardPeriodFilter
        quickPeriod={quickPeriod}
        onQuickPeriodChange={handleQuickPeriodSelect}
        selectedMonth={null}
        selectedYear={null}
        customStartDate={customStartDate}
        customEndDate={customEndDate}
        onCustomDateRange={handleCustomDateRange}
        onClearAll={handleClearDateRange}
        accounts={[account]}
        monthStartDay={monthStartDay}
        filteredEarning={filteredAdded}
        filteredWithdrawals={filteredWithdrawals}
        netBalance={totalBalance}
        formatCurrencyRupee={formatCurrency}
        metricsLabels={metricsLabels}
      />
    </View>
  );
};

const createStyles = colors => StyleSheet.create({
  stickyHeader: {
    backgroundColor: colors.headerBg,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    elevation: 4,
  },
  header: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.headerBorder,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 78,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -4,
  },
  accountAvatarTap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.headerChip,
    borderWidth: 1,
    borderColor: colors.headerChipBorder,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: spacing.xs,
  },
  headerTitleBlock: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingLeft: spacing.md - 2,
    paddingRight: spacing.xs,
  },
  headerTitle: {
    fontSize: fontSize.large,
    fontWeight: fontWeight.semibold,
    color: colors.headerText,
    textAlign: 'left',
  },
  headerMetaPill: {
    marginTop: spacing.xs + 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: colors.headerChip,
    borderColor: colors.headerChipBorder,
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: fontWeight.medium,
    color: colors.headerSubtext,
    textAlign: 'left',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: spacing.sm,
    gap: 8,
  },
  backupButton: {
    width: 42,
    height: 42,
    borderRadius: 15,
    padding: 0,
  },
  backupIconWrapper: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: colors.headerChip,
    borderWidth: 1,
    borderColor: colors.headerChipBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backupSpinner: {
    position: 'absolute',
    width: 30,
    height: 30,
  },
  menuButton: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.headerChip,
    borderWidth: 1,
    borderColor: colors.headerChipBorder,
  },
});

export default React.memo(AccountDetailHeader);
