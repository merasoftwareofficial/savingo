import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {spacing, typography} from '../utils/theme';
import {useTheme} from '../context/ThemeContext';
import {withAlpha} from '../utils/color';
import {ACCOUNT_COLOR_MIGRATION_MAP} from './accountVisuals';
import Card from '../components/ui/Card';
import IconCircle from '../components/ui/IconCircle';
import ListRow from '../components/ui/ListRow';
import SectionHeader from '../components/ui/SectionHeader';

// Accounts tab list: one rounded card per account type, header shows the section total.
const CombinedAccountsCard = ({
  sections,
  cardPeriodText,
  formatCurrency,
  onOpenAccount,
  onOpenContextMenu,
  renderAccountIcon,
}) => {
  const {colors} = useTheme();
  const visibleSections = sections.filter(section => section.accounts?.length > 0);
  if (visibleSections.length === 0) {
    return null;
  }

  return (
    <View>
      {visibleSections.map(section => {
        const sectionTotal = section.accounts.reduce(
          (sum, account) => sum + (Number(section.getSecondaryValue(account)) || 0),
          0,
        );
        return (
          <View key={section.title} style={styles.section}>
            <SectionHeader
              title={section.title}
              right={
                <Text style={[styles.sectionTotal, {color: colors.text.primary}]}>
                  {formatCurrency(sectionTotal)}
                </Text>
              }
            />
            <Card padded={false} style={styles.card}>
              {section.accounts.map((account, index) => {
                const storedColor = account.icon_color
                  ? ACCOUNT_COLOR_MIGRATION_MAP[account.icon_color] || account.icon_color
                  : null;
                const accentColor = storedColor || section.fallbackColor || colors.text.secondary;
                return (
                  <ListRow
                    key={account.id}
                    leading={
                      <IconCircle
                        size={42}
                        shape="square"
                        background={withAlpha(accentColor, 0.14)}>
                        {renderAccountIcon(account.icon || section.fallbackIcon, 22, accentColor)}
                      </IconCircle>
                    }
                    title={account.account_name}
                    subtitle={cardPeriodText}
                    value={formatCurrency(section.getSecondaryValue(account))}
                    valueSubtitle={section.secondaryLabel}
                    leadingSize={42}
                    chevron
                    divider={index < section.accounts.length - 1}
                    onPress={() => onOpenAccount(account)}
                    onLongPress={() => onOpenContextMenu(account)}
                  />
                );
              })}
            </Card>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.lg - 4,
  },
  card: {
    overflow: 'hidden',
  },
  sectionTotal: {
    ...typography.label,
    fontWeight: '700',
  },
});

export default React.memo(CombinedAccountsCard);
