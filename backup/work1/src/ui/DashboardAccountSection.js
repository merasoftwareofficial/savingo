import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {fontWeight} from '../utils/theme';

const DashboardAccountSection = ({
  title,
  accounts,
  styles,
  colors,
  isDark,
  cardPeriodText,
  formatCurrency,
  primaryLabel,
  secondaryLabel,
  getPrimaryValue,
  getSecondaryValue,
  onOpenAccount,
  onOpenContextMenu,
  renderAccountIcon,
  hexToRgba,
  fallbackIcon,
  fallbackColor,
  highlightSecondaryValue = false,
}) => {
  const sectionStyles = React.useMemo(() => createSectionStyles(colors), [colors]);

  if (accounts.length === 0) {
    return null;
  }

  return (
    <View style={[sectionStyles.shadow, {shadowColor: colors.shadow}]}>
      <View style={[sectionStyles.card, {backgroundColor: colors.card, borderColor: colors.border}]}>
        {/* Section Header */}
        <View style={[sectionStyles.header, {borderBottomColor: colors.border}]}>
          <Text style={[sectionStyles.headerTitle, {color: colors.text.primary}]}>
            {title}
          </Text>
        </View>

        {/* Account Rows */}
        {accounts.map((account, idx) => {
          const accentColor = account.icon_color || fallbackColor;
          const isLast = idx === accounts.length - 1;
          const primaryValue = getPrimaryValue(account);
          const secondaryValue = getSecondaryValue(account);

          return (
            <TouchableOpacity
              key={account.id}
              onPress={() => onOpenAccount(account)}
              onLongPress={() => onOpenContextMenu(account)}
              activeOpacity={0.7}>
              <View style={[sectionStyles.row, !isLast && {borderBottomColor: colors.border}]}>
                {/* Icon */}
                <View style={[sectionStyles.iconBox, {backgroundColor: hexToRgba(accentColor, 0.12)}]}>
                  {renderAccountIcon(account.icon || fallbackIcon, 24, accentColor)}
                </View>

                {/* Name + Period */}
                <View style={sectionStyles.nameCol}>
                  <View style={sectionStyles.nameRow}>
                    <Text style={[sectionStyles.name, {color: colors.text.primary}]} numberOfLines={1}>
                      {account.account_name}
                    </Text>
                  </View>
                  <Text style={[sectionStyles.period, {color: colors.text.secondary}]}>
                    {cardPeriodText}
                  </Text>
                </View>

                {/* Amount Primary */}
                <View style={sectionStyles.amountCol}>
                  <Text style={[sectionStyles.amountVal, {color: colors.text.primary}]}>
                    {formatCurrency(primaryValue)}
                  </Text>
                  <Text style={[sectionStyles.amountLbl, {color: colors.text.secondary}]}>
                    {primaryLabel}
                  </Text>
                </View>

                {/* Amount Secondary */}
                <View style={sectionStyles.amountCol}>
                  <Text style={[sectionStyles.amountVal, {color: highlightSecondaryValue ? accentColor : colors.text.primary}]}>
                    {formatCurrency(secondaryValue)}
                  </Text>
                  <Text style={[sectionStyles.amountLbl, {color: colors.text.secondary}]}>
                    {secondaryLabel}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const createSectionStyles = colors => StyleSheet.create({
  shadow: {
    marginBottom: 8,
    marginHorizontal: 6,
    borderRadius: 12,
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 3,
  },
  card: {
    borderRadius: 12,
    borderWidth: 0.8,
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderBottomWidth: 1.5,
    borderBottomColor: colors.text.primary,
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: fontWeight.bold,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    flexShrink: 0,
  },
  nameCol: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  name: {
    fontSize: 15,
    fontWeight: fontWeight.bold,
    flexShrink: 1,
  },
  period: {
    fontSize: 11,
    marginTop: 2,
  },
  amountCol: {
    alignItems: 'flex-end',
    marginLeft: 10,
  },
  amountVal: {
    fontSize: 13,
    fontWeight: fontWeight.bold,
  },
  amountLbl: {
    fontSize: 10,
    marginTop: 1,
  },
});

export default React.memo(DashboardAccountSection);
