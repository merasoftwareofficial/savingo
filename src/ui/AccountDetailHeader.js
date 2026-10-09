import React from 'react';
import {View, Text, TouchableOpacity} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import TexturedSurface from '../components/TexturedSurface';
import DashboardPeriodFilter from '../components/DashboardPeriodFilter';
import ManualBackupButton from '../components/ManualBackupButton';

const AccountDetailHeader = ({
  styles,
  insets,
  account,
  handleBackNavigation,
  handleStickyHeaderLayout,
  headerGradientStart,
  headerGradientEnd,
  withAlpha,
  headerForegroundColor,
  headerSubtitleColor,
  accountTypeLabel,
  headerAvatarToneStyle,
  renderAccountHeaderIcon,
  headerIconColor,
  menuButtonRef,
  openAccountMenu,
  handleOpenPersonalize,
  headerTexture,
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
  return (
    <View style={styles.stickyHeader} onLayout={handleStickyHeaderLayout}>
      <TexturedSurface
        gradientStart={headerGradientStart}
        gradientEnd={headerGradientEnd}
        style={[
          styles.header,
          {
            paddingTop: 8 + insets.top,
          },
          account.icon_color && {
            borderBottomColor: withAlpha(account.icon_color, 0.3),
          },
        ]}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity onPress={handleBackNavigation} style={styles.backButton}>
            <Icon name="chevron-back" size={22} color={headerTexture.icon} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleOpenPersonalize}
            style={styles.accountAvatarTap}
            activeOpacity={0.85}>
            <View style={[styles.accountAvatar, headerAvatarToneStyle]}>
              {renderAccountHeaderIcon(account?.icon, 28, headerIconColor)}
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleOpenPersonalize}
            style={styles.headerTitleBlock}
            activeOpacity={0.85}>
            <Text style={[styles.headerTitle, {color: headerForegroundColor}]}>
              {account.account_name}
            </Text>
            <View
              style={[
                styles.headerMetaPill,
                {
                  backgroundColor: withAlpha(headerForegroundColor, 0.12),
                  borderColor: withAlpha(headerForegroundColor, 0.14),
                },
              ]}>
              <Text style={[styles.headerSubtitle, {color: headerSubtitleColor}]}>
                {accountTypeLabel}
              </Text>
            </View>
          </TouchableOpacity>
          <View style={styles.headerActions}>
            <ManualBackupButton
              style={styles.backupButton}
              iconWrapperStyle={styles.backupIconWrapper}
              spinnerStyle={styles.backupSpinner}
              iconColor={headerTexture.icon}
            />
            <View ref={menuButtonRef} collapsable={false}>
              <TouchableOpacity onPress={openAccountMenu} style={styles.menuButton}>
                <Icon name="ellipsis-vertical" size={22} color={headerTexture.icon} />
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
        themeColor={account.icon_color || '#059669'}
        metricsLabels={metricsLabels}
      />
    </View>
  );
};

export default React.memo(AccountDetailHeader);
