import React from 'react';
import {View, Text} from 'react-native';
import TapEffect from '../components/ui/TapEffect';

const DashboardAccountCard = ({
  account,
  styles,
  colors,
  isDark,
  cardPeriodText,
  formatCurrency,
  primaryLabel,
  primaryValue,
  secondaryLabel,
  secondaryValue,
  onPress,
  onLongPress,
  renderAccountIcon,
  fallbackIcon,
  fallbackColor,
  hexToRgba,
  highlightSecondaryValue = false,
}) => {
  const accentColor = account.icon_color || fallbackColor;

  return (
    <View style={styles.accountItemShadow}>
      <TapEffect
        style={[
          styles.accountItem,
          {
            backgroundColor: colors.card,
            borderColor: hexToRgba(accentColor, 0.3),
          },
        ]}
        onPress={onPress}
        onLongPress={onLongPress}>
        <View style={styles.accountRow}>
          <View
            style={[
              styles.accountIcon,
              {backgroundColor: hexToRgba(accentColor, 0.18)},
            ]}>
            {renderAccountIcon(account.icon || fallbackIcon, 28, accentColor)}
          </View>

          <View style={styles.accountDetails}>
            <View style={styles.accountHeader}>
              <View style={styles.accountHeaderContent}>
                <View style={styles.accountNameRow}>
                  <Text style={styles.accountName}>{account.account_name}</Text>
                </View>
                <Text style={styles.accountDate}>{cardPeriodText}</Text>
              </View>
            </View>
            <View
              style={[
                styles.accountAmountsSection,
                {borderTopColor: hexToRgba(accentColor, 0.2)},
              ]}>
              <View style={styles.accountAmountItem}>
                <Text
                  style={[
                    styles.accountAmountLabel,
                    isDark && styles.accountAmountLabelDark,
                  ]}>
                  {primaryLabel}
                </Text>
                <Text style={styles.accountAmountValue}>
                  {formatCurrency(primaryValue)}
                </Text>
              </View>
              <View style={styles.accountAmountItem}>
                <Text
                  style={[
                    styles.accountAmountLabel,
                    isDark && styles.accountBalanceLabelDark,
                  ]}>
                  {secondaryLabel}
                </Text>
                <Text
                  style={[
                    styles.accountAmountValue,
                    highlightSecondaryValue && accentColor
                      ? {color: accentColor}
                      : null,
                  ]}>
                  {formatCurrency(secondaryValue)}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </TapEffect>
    </View>
  );
};

export default React.memo(DashboardAccountCard);
