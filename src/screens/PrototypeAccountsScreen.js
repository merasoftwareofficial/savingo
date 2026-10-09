/**
 * DESIGN PROTOTYPE — Professional Account Cards UX
 * Synced with app theme (light/dark)
 * Static mock data for layout approval
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTheme} from '../context/ThemeContext';
import {spacing, fontSize, fontWeight} from '../utils/theme';

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_PERIOD = 'Last 10 days';

const MOCK_METRICS = {
  earning: 124500,
  expenses: 87200,
  net: 37300,
};

const MOCK_SECTIONS = [
  {
    title: 'Earning',
    type: 'earning',
    accounts: [
      {id: 1, name: 'Salary Account', icon: 'trending-up', color: '#22C55E', balance: 85000, amount: 42000, isPrimary: true},
      {id: 2, name: 'Freelance', icon: 'briefcase', color: '#10B981', balance: 39500, amount: 18000},
    ],
  },
  {
    title: 'Savings',
    type: 'saving',
    accounts: [
      {id: 3, name: 'Emergency Fund', icon: 'shield-checkmark', color: '#F59E0B', balance: 250000, amount: 15000},
    ],
  },
  {
    title: 'Expenses',
    type: 'expenses',
    accounts: [
      {id: 4, name: 'Daily Needs', icon: 'cart', color: '#EF4444', balance: 12000, amount: 45000},
      {id: 5, name: 'Bills & Rent', icon: 'home', color: '#F97316', balance: 5200, amount: 28000},
    ],
  },
  {
    title: 'Credit Cards',
    type: 'credit',
    accounts: [
      {id: 7, name: 'HDFC Platinum', icon: 'card', color: '#2563EB', balance: 18000, amount: 9000},
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = n => `₹ ${Math.abs(n).toLocaleString('en-IN')}`;

const hexToRgba = (hex, alpha) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

// ─── Period + Metrics (Combined UX) ────────────────────────────────────────────

const PeriodMetrics = ({colors}) => {
  const [activeTab, setActiveTab] = React.useState(0);
  const tabs = ['10 Days', 'Calendar', 'Reports'];

  return (
    <View style={[pm.container, {backgroundColor: colors.card, borderBottomColor: colors.border}]}>
      {/* Tab selector */}
      <View style={pm.tabs}>
        {tabs.map((tab, i) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(i)}
            activeOpacity={0.7}
            style={[pm.tab, activeTab === i && {borderBottomColor: colors.primary}]}>
            <Text style={[pm.tabLabel, {color: activeTab === i ? colors.primary : colors.text.secondary}]}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Metrics row */}
      <View style={[pm.metrics, {backgroundColor: colors.surface}]}>
        <View style={pm.metricCol}>
          <Text style={[pm.metricVal, {color: '#22C55E'}]}>{fmt(MOCK_METRICS.earning)}</Text>
          <Text style={[pm.metricLbl, {color: colors.text.secondary}]}>Earning</Text>
        </View>
        <View style={[pm.divider, {backgroundColor: colors.border}]} />
        <View style={pm.metricCol}>
          <Text style={[pm.metricVal, {color: '#EF4444'}]}>{fmt(MOCK_METRICS.expenses)}</Text>
          <Text style={[pm.metricLbl, {color: colors.text.secondary}]}>Expenses</Text>
        </View>
        <View style={[pm.divider, {backgroundColor: colors.border}]} />
        <View style={pm.metricCol}>
          <Text style={[pm.metricVal, {color: MOCK_METRICS.net >= 0 ? colors.primary : '#EF4444'}]}>
            {fmt(MOCK_METRICS.net)}
          </Text>
          <Text style={[pm.metricLbl, {color: colors.text.secondary}]}>Net Balance</Text>
        </View>
      </View>
    </View>
  );
};

const pm = StyleSheet.create({
  container: {
    borderBottomWidth: 1,
    marginBottom: spacing.md,
    marginHorizontal: -spacing.md,
    marginTop: -spacing.md,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
  },
  metrics: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
  },
  metricCol: {
    flex: 1,
    alignItems: 'center',
  },
  metricVal: {
    fontSize: 16,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.3,
  },
  metricLbl: {
    fontSize: 10,
    marginTop: 2,
    fontWeight: fontWeight.medium,
  },
  divider: {
    width: 1,
    height: 22,
    alignSelf: 'center',
  },
});

// ─── Section Card (Multiple Accounts) ──────────────────────────────────────────

const SectionCard = ({section, colors, labelMap}) => {
  return (
    <View style={[scard.shadow, {shadowColor: colors.shadow}]}>
      <View style={[scard.root, {backgroundColor: colors.card, borderColor: colors.border}]}>
        {/* Section Header */}
        <View style={[scard.header, {borderBottomColor: colors.border}]}>
          <Text style={[scard.headerTitle, {color: colors.text.primary}]}>
            {section.title}
          </Text>
        </View>

        {/* Account Rows */}
        {section.accounts.map((account, idx) => {
          const c = account.color;
          const labels = labelMap[section.type];
          const isLast = idx === section.accounts.length - 1;

          return (
            <View key={account.id}>
              <View style={[scard.row, {borderBottomColor: colors.border}]}>
                {/* Icon */}
                <View style={[scard.iconBox, {backgroundColor: hexToRgba(c, 0.12)}]}>
                  <Icon name={account.icon} size={18} color={c} />
                </View>

                {/* Name + Period */}
                <View style={scard.nameCol}>
                  <View style={scard.nameRow}>
                    <Text style={[scard.name, {color: colors.text.primary}]} numberOfLines={1}>
                      {account.name}
                    </Text>
                    {account.isPrimary && (
                      <Icon name="star" size={10} color="#F59E0B" style={{marginLeft: 3}} />
                    )}
                  </View>
                  <Text style={[scard.period, {color: colors.text.secondary}]}>
                    {MOCK_PERIOD}
                  </Text>
                </View>

                {/* Amount Primary */}
                <View style={scard.amountCol}>
                  <Text style={[scard.amountVal, {color: colors.text.primary}]}>
                    {fmt(account.amount)}
                  </Text>
                  <Text style={[scard.amountLbl, {color: colors.text.secondary}]}>
                    {labels.primary}
                  </Text>
                </View>

                {/* Amount Secondary */}
                <View style={scard.amountCol}>
                  <Text style={[scard.amountVal, {color: c}]}>
                    {fmt(account.balance)}
                  </Text>
                  <Text style={[scard.amountLbl, {color: colors.text.secondary}]}>
                    {labels.secondary}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const scard = StyleSheet.create({
  shadow: {
    marginBottom: 8,
    borderRadius: 12,
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
    marginHorizontal: 6,
  },
  root: {
    borderRadius: 12,
    borderWidth: 0.8,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
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
    borderBottomWidth: 0.8,
  },
  iconBox: {
    width: 36,
    height: 36,
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


// ─── Main Screen ──────────────────────────────────────────────────────────────

const PrototypeAccountsScreen = () => {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();

  const labelMap = {
    earning: {primary: 'Transferred', secondary: 'Balance'},
    saving: {primary: 'Transferred', secondary: 'Savings'},
    expenses: {primary: 'Expenses', secondary: 'Balance'},
    credit: {primary: 'Credit Used', secondary: 'Outstanding'},
  };

  return (
    <View style={[styles.root, {backgroundColor: colors.background}]}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="transparent"
        translucent
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, {paddingTop: insets.top}]}>

        {/* Period + Metrics (Combined) */}
        <PeriodMetrics colors={colors} />

        {/* Account Sections — Multiple accounts per card */}
        {MOCK_SECTIONS.map((sec, idx) => (
          <SectionCard
            key={sec.type}
            section={sec}
            colors={colors}
            labelMap={labelMap}
          />
        ))}

        <View style={{height: 40}} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 0,
    paddingBottom: spacing.md,
  },
});

export default PrototypeAccountsScreen;
