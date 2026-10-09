import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
  PanResponder,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import BsCashCoin from '../components/icons/BsCashCoin';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import TexturedSurface from '../components/TexturedSurface';
import {spacing, fontSize, fontWeight, headerTexture} from '../utils/theme';
import {useTheme} from '../context/ThemeContext';
import {getAllAccounts, updateAccountPersonalization, updateCreditLimit} from '../services/accountsDatabase';
import {publishAccountsChanged} from '../services/accountsChangeBus';
import {useToast} from '../hooks/useToast';
import {
  ACCOUNT_COLOR_OPTIONS as ACCOUNT_COLORS,
  CREDIT_ACCOUNT_COLOR_OPTIONS as CREDIT_ACCOUNT_COLORS,
  MANUAL_ACCOUNT_ICON_OPTIONS as MANUAL_ICONS,
} from '../ui/accountVisuals';
import {
  CREDIT_LIMIT_MIN,
  CREDIT_LIMIT_MAX,
  CREDIT_LIMIT_DEFAULT,
  formatCreditLimit,
} from '../utils/creditLimitUtils';

const COLLAPSED_H = 52;
const EXPANDED_H  = 190;

const renderAccountIcon = (iconName, size, color) => {
  if (iconName === 'bs-cash-coin') return <BsCashCoin size={size} color={color} />;
  return <Icon name={iconName} size={size} color={color} />;
};

const PersonalizeAccountScreen = ({navigation, route}) => {
  const {colors} = useTheme();
  const {showToast} = useToast();
  const insets = useSafeAreaInsets();
  const accountId = route?.params?.accountId ?? route?.params?.account?.id ?? null;

  const [account, setAccount]           = React.useState(null);
  const [selectedIcon, setSelectedIcon] = React.useState(MANUAL_ICONS[0].icon);
  const [selectedColor, setSelectedColor] = React.useState(ACCOUNT_COLORS[0].value);
  const [expanded, setExpanded]         = React.useState(false);
  const [creditLimit, setCreditLimit]   = React.useState(CREDIT_LIMIT_DEFAULT);
  const [customLimitInput, setCustomLimitInput] = React.useState('');
  const [creditLimitSaving, setCreditLimitSaving] = React.useState(false);
  const isCreditAccount = account?.account_type === 'credit';
  const accountColorOptions = isCreditAccount ? CREDIT_ACCOUNT_COLORS : ACCOUNT_COLORS;

  const expandedRef = React.useRef(false);
  const expandAnim  = React.useRef(new Animated.Value(0)).current;
  const fadeAnim    = React.useRef(new Animated.Value(0)).current;
  const scaleAnim   = React.useRef(new Animated.Value(0.96)).current;

  const saveTimeoutRef    = React.useRef(null);
  const creditLimitSavingHideRef = React.useRef(null);
  const creditLimitSaveSeqRef = React.useRef(0);
  const lastSavedRef      = React.useRef({icon: null, color: null, creditLimit: null});
  const isInitializedRef  = React.useRef(false);
  const QUICK_LIMIT_OPTIONS = [5000, 10000, 25000, 50000, 100000, 150000, 200000, 300000, 500000, 1000000];

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {toValue: 1, duration: 350, useNativeDriver: true}),
      Animated.spring(scaleAnim, {toValue: 1, tension: 60, friction: 8, useNativeDriver: true}),
    ]).start();
  }, [fadeAnim, scaleAnim]);

  const snapTo = (toExpanded) => {
    expandedRef.current = toExpanded;
    setExpanded(toExpanded);
    Animated.spring(expandAnim, {
      toValue: toExpanded ? 1 : 0,
      tension: 70, friction: 11, useNativeDriver: false,
    }).start();
  };

  const dragPanResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 5,
      onPanResponderMove: (_, gs) => {
        const base  = expandedRef.current ? 1 : 0;
        const delta = -gs.dy / (EXPANDED_H - COLLAPSED_H);
        expandAnim.setValue(Math.min(1, Math.max(0, base + delta)));
      },
      onPanResponderRelease: (_, gs) => {
        if (!expandedRef.current && (gs.dy < -25 || gs.vy < -0.4)) snapTo(true);
        else if (expandedRef.current && (gs.dy > 25 || gs.vy > 0.4)) snapTo(false);
        else snapTo(expandedRef.current);
      },
    }),
  ).current;


  const loadAccount = React.useCallback(() => {
    if (!accountId) return;
    const accounts = getAllAccounts();
    const target = accounts.find(item => String(item.id) === String(accountId));
    if (!target) return;
    isInitializedRef.current = false;
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    setAccount(target);
    const resolvedIcon = target.icon || MANUAL_ICONS[0].icon;
    setSelectedIcon(resolvedIcon);
    const fallbackColor =
      target.account_type === 'credit'
        ? CREDIT_ACCOUNT_COLORS[0].value
        : ACCOUNT_COLORS[0].value;
    const resolvedColor = target.icon_color || fallbackColor;
    setSelectedColor(resolvedColor);
    const resolvedLimit = target.credit_limit ?? CREDIT_LIMIT_DEFAULT;
    setCreditLimit(resolvedLimit);
    lastSavedRef.current = {
      icon: resolvedIcon,
      color: resolvedColor,
      creditLimit: resolvedLimit,
    };
    isInitializedRef.current = true;
  }, [accountId]);

  React.useEffect(() => {
    loadAccount();
  }, [loadAccount]);

  const handleQuickLimit = (amount) => {
    setCreditLimit(amount);
    setCustomLimitInput('');
  };

  const handleCustomLimitSet = () => {
    const num = parseInt(customLimitInput.replace(/[^0-9]/g, ''), 10);
    if (Number.isNaN(num) || num < CREDIT_LIMIT_MIN || num > CREDIT_LIMIT_MAX) {
      showToast(`Enter amount between ₹${CREDIT_LIMIT_MIN.toLocaleString('en-IN')} - ₹${CREDIT_LIMIT_MAX.toLocaleString('en-IN')}`, 'error');
      return;
    }
    setCreditLimit(num);
    setCustomLimitInput('');
  };

  React.useEffect(() => {
    if (!account?.id || !isInitializedRef.current) return;
    const nextState = {
      icon: selectedIcon ?? '',
      color: selectedColor ?? '',
    };
    const lastState = lastSavedRef.current;
    if (lastState.icon === nextState.icon && lastState.color === nextState.color) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await updateAccountPersonalization(account.id, nextState.icon, nextState.color);
        lastSavedRef.current = nextState;
        publishAccountsChanged({
          reason: 'account-personalization-updated',
          accountIds: [account.id],
          changeTypes: ['personalization-changed'],
          source: 'PersonalizeAccountScreen',
        });
      } catch (error) {
        showToast('Failed to update account', 'error');
      }
    }, 250);
  }, [account?.id, selectedIcon, selectedColor, showToast]);

  const creditLimitTimeoutRef = React.useRef(null);

  React.useEffect(() => {
    if (!isCreditAccount || !account?.id || !isInitializedRef.current) return;
    if (lastSavedRef.current?.creditLimit === creditLimit) {
      setCreditLimitSaving(false);
      return;
    }
    const saveSeq = creditLimitSaveSeqRef.current + 1;
    creditLimitSaveSeqRef.current = saveSeq;
    if (creditLimitSavingHideRef.current) {
      clearTimeout(creditLimitSavingHideRef.current);
      creditLimitSavingHideRef.current = null;
    }
    setCreditLimitSaving(true);
    if (creditLimitTimeoutRef.current) clearTimeout(creditLimitTimeoutRef.current);
    creditLimitTimeoutRef.current = setTimeout(async () => {
      try {
        await updateCreditLimit(account.id, creditLimit);
        lastSavedRef.current = {...lastSavedRef.current, creditLimit};
        publishAccountsChanged({
          reason: 'account-personalization-updated',
          accountIds: [account.id],
          changeTypes: ['personalization-changed'],
          source: 'PersonalizeAccountScreen',
        });
      } catch (error) {
        showToast('Failed to update credit limit', 'error');
      } finally {
        creditLimitSavingHideRef.current = setTimeout(() => {
          if (creditLimitSaveSeqRef.current === saveSeq) {
            setCreditLimitSaving(false);
          }
        }, 650);
      }
    }, 250);
  }, [isCreditAccount, account?.id, creditLimit, showToast]);

  React.useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (creditLimitTimeoutRef.current) clearTimeout(creditLimitTimeoutRef.current);
      if (creditLimitSavingHideRef.current) clearTimeout(creditLimitSavingHideRef.current);
    };
  }, []);

  const styles = React.useMemo(() => StyleSheet.create({
    screen: {flex: 1, backgroundColor: colors.background},

    header: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: colors.headerBg,
      borderBottomWidth: 1,
      borderBottomColor: headerTexture.border,
      elevation: 2,
    },
    headerTopRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 64},
    backButton: {padding: 6},
    headerTitle: {flex: 1, textAlign: 'center', fontSize: fontSize.large, fontWeight: fontWeight.semibold, color: headerTexture.title},
    headerSpacer: {width: 34},

    animatedContainer: {flex: 1},
    scrollView: {flex: 1},
    scrollContent: {flexGrow: 1, padding: 20, paddingBottom: 16, justifyContent: 'flex-end'},

    // Created chip
    createdChip: {flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-end', backgroundColor: colors.surfaceMuted, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, marginTop: 10},
    createdChipText: {fontSize: 12, color: colors.text.secondary, fontWeight: '600'},

    // Preview
    previewWrapper: {backgroundColor: colors.surfaceMuted, borderRadius: 20, padding: 16},
    previewLabel: {fontSize: 12, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10},
    previewCard: {flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 16, padding: 16, borderWidth: 1.5, borderColor: colors.border, elevation: 2, shadowColor: colors.shadow, shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.06, shadowRadius: 8, gap: 14},
    previewIconBox: {width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center'},
    previewInfo: {flex: 1},
    previewName: {fontSize: 17, fontWeight: '700', color: colors.text.primary},
    previewType: {fontSize: 13, color: colors.text.secondary, marginTop: 2, textTransform: 'capitalize'},
    previewColorDot: {width: 12, height: 12, borderRadius: 6},

    // Bottom bar
    bottomBar: {paddingHorizontal: 20, paddingTop: 8, backgroundColor: colors.card, elevation: 8, shadowColor: colors.shadow, shadowOffset: {width: 0, height: -2}, shadowOpacity: 0.06, shadowRadius: 12},

    // Drag handle
    dragHandleWrapper: {alignItems: 'center', paddingVertical: 8},
    dragHandle: {width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border},

    sectionLabel: {fontSize: 12, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10},

    // Expandable
    categoryContainer: {overflow: 'hidden', marginBottom: 4},
    categoryLayer: {position: 'absolute', left: 0, right: 0, top: 0},
    categoryGridOverlay: {zIndex: 1, bottom: 0},

    // Icon pills
    tagScrollContent: {gap: 8, paddingRight: 4, paddingBottom: 4},
    tagGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
    iconTagItem: {width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, elevation: 1},

    // Color
    colorSection: {marginBottom: 12},
    colorRow: {flexDirection: 'row', gap: 12},
    colorShadow: {width: 44, height: 44, borderRadius: 22, elevation: 3, shadowColor: colors.shadow, shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.18, shadowRadius: 4},
    colorCircle: {width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center'},
    colorCircleSelected: {borderWidth: 3, borderColor: colors.card},

    // Credit Limit
    creditLimitSection: {marginBottom: 12},
    creditLimitHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12},
    creditLimitStatus: {flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 22},
    creditLimitValue: {fontSize: 16, fontWeight: '700', color: colors.text.primary},
    creditLimitSavingText: {fontSize: 12, fontWeight: '700', color: colors.text.secondary},
    quickButtonsScroll: {gap: 8, paddingRight: 4, marginBottom: 16},
    quickButton: {height: 44, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center'},
    quickButtonText: {fontSize: 12, fontWeight: '700'},
    customLimitRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
    customLimitLabel: {fontSize: 12, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 0.8},
    customLimitInput: {flex: 1, height: 44, backgroundColor: colors.input, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, fontSize: 14, fontWeight: '600', color: colors.text.primary},
    setButton: {paddingHorizontal: 16, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center'},
    setButtonText: {fontSize: 13, fontWeight: '700', color: colors.white},
  }), [colors]);

  const createdLabel = account?.created_at
    ? new Date(account.created_at).toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: 'numeric'})
    : '—';

  const accentColor = selectedColor;

  const containerH   = expandAnim.interpolate({inputRange: [0, 1], outputRange: [COLLAPSED_H, EXPANDED_H]});
  const scrollOpacity = expandAnim.interpolate({inputRange: [0, 0.35], outputRange: [1, 0]});
  const gridOpacity   = expandAnim.interpolate({inputRange: [0.5, 1],  outputRange: [0, 1]});

  const IconPill = ({item}) => {
    const isSel = selectedIcon === item.icon;
    return (
      <TouchableOpacity
        style={[styles.iconTagItem, {borderColor: isSel ? item.color : colors.border, backgroundColor: isSel ? item.color : colors.card}]}
        onPress={() => setSelectedIcon(item.icon)}
        activeOpacity={0.75}>
        {renderAccountIcon(item.icon, 22, isSel ? colors.white : item.color)}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.screen}>
      <TexturedSurface style={[styles.header, {paddingTop: spacing.sm + insets.top}]}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} activeOpacity={0.7}>
            <Icon name="chevron-back" size={22} color={headerTexture.icon} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Personalize Account</Text>
          <View style={styles.headerSpacer} />
        </View>
      </TexturedSurface>

      {/* Main scroll area */}
      <Animated.View style={[styles.animatedContainer, {opacity: fadeAnim, transform: [{scale: scaleAnim}]}]}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>

          {/* Preview card */}
          <View style={styles.previewWrapper}>
            <Text style={styles.previewLabel}>Account Preview</Text>
            <View style={[styles.previewCard, {borderColor: accentColor + '30'}]}>
              <View style={[styles.previewIconBox, {backgroundColor: accentColor + '18'}]}>
                {renderAccountIcon(selectedIcon, 28, accentColor)}
              </View>
              <View style={styles.previewInfo}>
                <Text style={styles.previewName}>{account?.account_name || 'Account'}</Text>
                <Text style={styles.previewType}>
                  {account?.account_type ? `${account.account_type} account` : 'Account'}
                </Text>
              </View>
              <View style={[styles.previewColorDot, {backgroundColor: accentColor}]} />
            </View>
            <View style={styles.createdChip}>
              <Icon name="time-outline" size={13} color={colors.text.secondary} />
              <Text style={styles.createdChipText}>Created {createdLabel}</Text>
            </View>
          </View>

        </ScrollView>
      </Animated.View>

      {/* Bottom bar */}
      <View style={[styles.bottomBar, {paddingBottom: 16 + insets.bottom}]}>

        {/* Drag handle */}
        <View style={styles.dragHandleWrapper} {...dragPanResponder.panHandlers}>
          <View style={styles.dragHandle} />
        </View>

        <Text style={styles.sectionLabel}>Icon</Text>

        {/* Expandable icon container */}
        <Animated.View style={[styles.categoryContainer, {height: containerH}]}>

          {/* Horizontal scroll — collapsed */}
          <Animated.View style={[styles.categoryLayer, {opacity: scrollOpacity}]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagScrollContent}>
              {MANUAL_ICONS.map(item => <IconPill key={item.tag} item={item} />)}
            </ScrollView>
          </Animated.View>

          {/* Grid — expanded, scrollable */}
          <Animated.View style={[styles.categoryLayer, styles.categoryGridOverlay, {opacity: gridOpacity}]} pointerEvents={expanded ? 'auto' : 'none'}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.tagGrid}>
                {MANUAL_ICONS.map(item => <IconPill key={item.tag} item={item} />)}
              </View>
            </ScrollView>
          </Animated.View>

        </Animated.View>

        {/* Color */}
        <View style={styles.colorSection}>
          <Text style={styles.sectionLabel}>Color</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.colorRow}>
            {accountColorOptions.map(c => {
              const isSel = selectedColor === c.value;
              return (
                <View key={c.name} style={[styles.colorShadow, {backgroundColor: c.value}]}>
                  <TouchableOpacity
                    style={[styles.colorCircle, {backgroundColor: c.value}, isSel && styles.colorCircleSelected]}
                    onPress={() => setSelectedColor(c.value)}
                    activeOpacity={0.8}>
                    {isSel && <Icon name="checkmark" size={16} color={colors.white} />}
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>
        </View>

        {/* Credit Limit — credit accounts only */}
        {isCreditAccount && (
          <View style={styles.creditLimitSection}>
            {/* Header */}
            <View style={styles.creditLimitHeader}>
              <Text style={styles.sectionLabel}>Credit Limit</Text>
              <View style={styles.creditLimitStatus}>
                {creditLimitSaving ? (
                  <>
                    <ActivityIndicator size="small" color={accentColor} />
                    <Text style={styles.creditLimitSavingText}>Updating limit...</Text>
                  </>
                ) : null}
                <Text style={styles.creditLimitValue}>{formatCreditLimit(creditLimit)}</Text>
              </View>
            </View>

            {/* Quick buttons — scrollable */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickButtonsScroll}>
              {QUICK_LIMIT_OPTIONS.map(amount => (
                <TouchableOpacity
                  key={amount}
                  style={[
                    styles.quickButton,
                    {
                      backgroundColor: creditLimit === amount ? accentColor : colors.card,
                      borderColor: creditLimit === amount ? accentColor : colors.border,
                    }
                  ]}
                  onPress={() => handleQuickLimit(amount)}
                  activeOpacity={0.7}>
                  <Text style={[
                    styles.quickButtonText,
                    {color: creditLimit === amount ? colors.white : colors.text.primary}
                  ]}>
                    ₹{amount >= 1000000 ? (amount / 1000000).toFixed(1) + 'M' : (amount / 1000).toFixed(0) + 'K'}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Custom input */}
            <View style={styles.customLimitRow}>
              <Text style={styles.customLimitLabel}>Custom:</Text>
              <TextInput
                style={[styles.customLimitInput, {borderColor: accentColor + '60'}]}
                placeholder="₹ Enter amount"
                placeholderTextColor={colors.text.light}
                value={customLimitInput}
                onChangeText={setCustomLimitInput}
                keyboardType="number-pad"
                maxLength={10}
              />
              <TouchableOpacity
                style={[styles.setButton, {backgroundColor: accentColor}]}
                onPress={handleCustomLimitSet}
                activeOpacity={0.7}>
                <Text style={styles.setButtonText}>Set</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

      </View>
    </View>
  );
};

export default PersonalizeAccountScreen;
