import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {fontWeight, fontSize} from '../utils/theme';

const CombinedAccountsCard = ({
  sections,
  colors,
  isDark,
  cardPeriodText,
  formatCurrency,
  onOpenAccount,
  onOpenContextMenu,
  renderAccountIcon,
  hexToRgba,
  fallbackIcon,
  fallbackColor,
}) => {
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const hasAnyAccounts = sections.some(s => s.accounts && s.accounts.length > 0);
  if (!hasAnyAccounts) {
    return null;
  }

  return (
    <View style={[styles.shadow, {shadowColor: colors.shadow}]}>
      <View style={[styles.card, {backgroundColor: colors.card, borderColor: colors.border}]}>
        {sections.map((section, sectionIdx) => {
          if (!section.accounts || section.accounts.length === 0) {
            return null;
          }

          const isFirstSection = sectionIdx === 0;
          const accountRows = section.accounts.map((account, accountIdx) => {
            const accentColor = account.icon_color || fallbackColor;
            const isLastRow =
              accountIdx === section.accounts.length - 1 &&
              sectionIdx === sections.filter(s => s.accounts?.length > 0).length - 1;

            return (
              <TouchableOpacity
                key={account.id}
                onPress={() => onOpenAccount(account)}
                onLongPress={() => onOpenContextMenu(account)}
                activeOpacity={0.7}>
                <View style={[styles.row, !isLastRow && {borderBottomColor: colors.border}, isLastRow && {borderBottomWidth: 0}]}>
                  {/* Icon */}
                  <View style={[styles.iconBox, {backgroundColor: hexToRgba(accentColor, 0.12)}]}>
                    {renderAccountIcon(account.icon || fallbackIcon, 24, accentColor)}
                  </View>

                  {/* Name + Period */}
                  <View style={styles.nameCol}>
                    <View style={styles.nameRow}>
                      <Text style={[styles.name, {color: colors.text.primary}]} numberOfLines={1}>
                        {account.account_name}
                      </Text>
                      {account.is_primary === 1 && (
                        <Icon name="star" size={10} color="#F59E0B" style={{marginLeft: 3}} />
                      )}
                    </View>
                    <Text style={[styles.period, {color: colors.text.secondary}]}>
                      {cardPeriodText}
                    </Text>
                  </View>

                  {/* Amount Secondary */}
                  <View style={styles.amountCol}>
                    <Text style={[styles.amountLbl, {color: colors.text.secondary}]}>
                      {section.secondaryLabel}
                    </Text>
                    <Text
                      style={[
                        styles.amountVal,
                        {
                          color: section.highlightSecondaryValue
                            ? accentColor
                            : colors.text.primary,
                        },
                      ]}>
                      {formatCurrency(section.getSecondaryValue(account))}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          });

          return (
            <View key={section.title}>
              {/* Subsection Header */}
              {!isFirstSection && (
                <View style={[styles.subsectionDivider, {borderBottomColor: colors.border}]} />
              )}
              <View style={[styles.subsectionHeader, {borderBottomColor: colors.border}]}>
                <Text style={[styles.subsectionTitle, {color: colors.text.secondary}]}>
                  {section.title}
                </Text>
              </View>

              {/* Account Rows */}
              {accountRows}
            </View>
          );
        })}
      </View>
    </View>
  );
};

const createStyles = colors =>
  StyleSheet.create({
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
      borderWidth: 1.5,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    subsectionHeader: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderBottomWidth: 1.5,
      borderBottomColor: colors.text.primary,
      backgroundColor: colors.card,
    },
    subsectionTitle: {
      fontSize: 13,
      fontWeight: fontWeight.semibold,
    },
    subsectionDivider: {
      height: 0.8,
      marginHorizontal: 0,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 11,
      borderBottomWidth: 0.8,
      borderBottomColor: colors.text.primary,
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
      fontSize: 16,
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
      fontSize: fontSize.large,
      fontWeight: fontWeight.bold,
    },
    amountLbl: {
      fontSize: 13,
      marginTop: 1,
    },
  });

export default React.memo(CombinedAccountsCard);
