import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Animated,
  PanResponder,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import BsCashCoin from '../components/icons/BsCashCoin';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import PageHeader from '../components/ui/PageHeader';
import {
  createAccount,
  getAllAccounts,
  isAccountNameExists,
} from '../services/accountsDatabase';
import {publishAccountsChanged} from '../services/accountsChangeBus';
import {spacing, fontSize, fontWeight, headerTexture} from '../utils/theme';
import {useTheme} from '../context/ThemeContext';
import {useAppAlert} from '../context/AppAlertContext';
import {
  ACCOUNT_COLOR_OPTIONS as ACCOUNT_COLORS,
  CREDIT_ACCOUNT_COLOR_OPTIONS as CREDIT_ACCOUNT_COLORS,
  CREDIT_TAG_OPTIONS as CREDIT_TAGS,
  EARNING_TAG_OPTIONS as EARNING_TAGS,
  EXPENSES_TAG_OPTIONS as EXPENSES_TAGS,
  MANUAL_ACCOUNT_ICON_OPTIONS as MANUAL_ICONS,
  getNextAccountVisual,
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

const AddAccountScreen = ({navigation, route}) => {
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
  const insets = useSafeAreaInsets();
  const accountType = route?.params?.accountType || 'earning';
  const isEarningAccount = accountType === 'earning';
  const isCreditAccount = accountType === 'credit';
  const tags = isCreditAccount
    ? CREDIT_TAGS
    : isEarningAccount
    ? EARNING_TAGS
    : EXPENSES_TAGS;
  const accountColorOptions = isCreditAccount ? CREDIT_ACCOUNT_COLORS : ACCOUNT_COLORS;
  const initialVisual = React.useMemo(
    () => getNextAccountVisual(getAllAccounts(), accountType),
    [accountType],
  );

  const [mode, setMode]               = React.useState('tag');
  const [selectedTag, setSelectedTag] = React.useState(null);
  const [selectedColor, setSelectedColor] = React.useState(initialVisual.color);
  const [customName, setCustomName]   = React.useState('');
  const [selectedIcon, setSelectedIcon] = React.useState(initialVisual.icon);
  const [loading, setLoading]         = React.useState(false);
  const [expanded, setExpanded]       = React.useState(false);
  const [creditLimit, setCreditLimit] = React.useState(CREDIT_LIMIT_DEFAULT);
  const [customLimitInput, setCustomLimitInput] = React.useState('');

  const expandedRef = React.useRef(false);
  const expandAnim  = React.useRef(new Animated.Value(0)).current;
  const fadeAnim    = React.useRef(new Animated.Value(0)).current;
  const scaleAnim   = React.useRef(new Animated.Value(0.96)).current;

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

  const handleTagSelect = item => {
    setSelectedTag(item);
    setSelectedColor(item.color);
    if (expandedRef.current) snapTo(false);
  };

  const handleModeSwitch = newMode => {
    setMode(newMode);
    setSelectedTag(null);
    setCustomName('');
    setSelectedIcon(initialVisual.icon);
    setSelectedColor(initialVisual.color);
    if (expandedRef.current) snapTo(false);
  };

  const QUICK_LIMIT_OPTIONS = [5000, 10000, 25000, 50000, 100000, 150000, 200000, 300000, 500000, 1000000];

  const handleSliderLayout = (event) => {
    sliderWidthRef.current = event.nativeEvent.layout.width;
  };

  const handleQuickLimit = (amount) => {
    setCreditLimit(amount);
    setCustomLimitInput('');
  };

  const handleCustomLimitSet = () => {
    const num = parseInt(customLimitInput.replace(/[^0-9]/g, ''), 10);
    if (Number.isNaN(num) || num < CREDIT_LIMIT_MIN || num > CREDIT_LIMIT_MAX) {
      themedAlert('Invalid amount', `Please enter amount between ₹${CREDIT_LIMIT_MIN.toLocaleString('en-IN')} and ₹${CREDIT_LIMIT_MAX.toLocaleString('en-IN')}`);
      return;
    }
    setCreditLimit(num);
    setCustomLimitInput('');
  };

  const getAccountName = () => mode === 'tag' ? (selectedTag?.tag || '') : customName.trim();
  const getAccountIcon = () => mode === 'tag' ? (selectedTag?.icon || tags[0].icon) : selectedIcon;
  const isValid = () => mode === 'tag' ? selectedTag !== null : customName.trim().length > 0;
  const accentColor = selectedColor;

  const handleCreate = async () => {
    const accountName = getAccountName();
    if (!accountName) { themedAlert('Error', 'Please select or enter an account name.'); return; }
    if (isAccountNameExists(accountName)) { themedAlert('Error', 'An account with this name already exists.'); return; }
    setLoading(true);
    try {
      const result = await createAccount(
        accountName,
        accountType,
        getAccountIcon(),
        selectedColor,
        isCreditAccount ? creditLimit : undefined
      );
      publishAccountsChanged({
        reason: 'account-created',
        source: 'add-account',
        accountId: result?.insertId,
        accountType,
      });
      navigation.goBack();
    } catch (e) {
      themedAlert('Error', 'Failed to create account. Please try again.');
    } finally { setLoading(false); }
  };

  const accountTypeDisplayLabel = isEarningAccount
    ? 'Earning Account'
    : isCreditAccount
    ? 'Credit Card Account'
    : 'Expenses Account';
  const headerTitle = isEarningAccount
    ? 'New Earning Account'
    : isCreditAccount
    ? 'New Credit Card Account'
    : 'New Expenses Account';

  const containerH = expandAnim.interpolate({inputRange: [0, 1], outputRange: [COLLAPSED_H, EXPANDED_H]});
  const scrollOpacity = expandAnim.interpolate({inputRange: [0, 0.35], outputRange: [1, 0]});
  const gridOpacity   = expandAnim.interpolate({inputRange: [0.5, 1], outputRange: [0, 1]});

  const TagPill = ({item, onPress}) => {
    const isSelected = selectedTag?.tag === item.tag;
    return (
      <TouchableOpacity
        style={[styles.tagPill, isSelected && [styles.tagPillSelected, {backgroundColor: item.color, borderColor: item.color}]]}
        onPress={onPress}
        activeOpacity={0.75}>
        <View style={[styles.tagIconBox, {backgroundColor: isSelected ? 'rgba(255,255,255,0.22)' : item.color + '18'}]}>
          {renderAccountIcon(item.icon, 15, isSelected ? '#fff' : item.color)}
        </View>
        <Text style={[styles.tagPillText, isSelected && styles.tagPillTextSelected]}>{item.tag}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.screen}>
      <PageHeader title={headerTitle} onBackPress={() => navigation.goBack()} />

      {/* Main scroll area */}
      <Animated.View style={[styles.animatedContainer, {opacity: fadeAnim, transform: [{scale: scaleAnim}]}]}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>

          {isCreditAccount && (
            <View style={[styles.section, {marginBottom: 24}]}>
              {/* Header */}
              <View style={styles.creditLimitHeader}>
                <Text style={styles.sectionLabel}>Credit Limit</Text>
                <Text style={styles.creditLimitValue}>{formatCreditLimit(creditLimit)}</Text>
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

          {mode === 'tag' ? (
            <View style={styles.previewWrapper}>
              <Text style={styles.previewLabel}>Account Preview</Text>
              <View style={[styles.previewCard, {borderColor: accentColor + '30'}]}>
                <View style={[styles.previewIconBox, {backgroundColor: accentColor + '18'}]}>
                  {selectedTag
                    ? renderAccountIcon(selectedTag.icon, 28, accentColor)
                    : <Icon name="pricetag-outline" size={28} color={colors.text.light} />}
                </View>
                <View style={styles.previewInfo}>
                  <Text style={[styles.previewName, !selectedTag && {color: colors.text.light}]}>
                    {selectedTag ? selectedTag.tag : 'Account Name'}
                  </Text>
                  <Text style={styles.previewType}>
                    {accountTypeDisplayLabel}
                  </Text>
                </View>
                <View style={[styles.previewColorDot, {backgroundColor: selectedTag ? accentColor : colors.border}]} />
              </View>
            </View>
          ) : (
            <>
              <View style={styles.previewWrapper}>
                <Text style={styles.previewLabel}>Account Preview</Text>
                <View style={[styles.previewCard, {borderColor: accentColor + '30'}]}>
                  <View style={[styles.previewIconBox, {backgroundColor: accentColor + '18'}]}>
                    {renderAccountIcon(selectedIcon, 28, accentColor)}
                  </View>
                  <View style={styles.previewInfo}>
                    <Text style={[styles.previewName, !customName.trim() && {color: colors.text.light}]}>
                      {customName.trim() || 'Account Name'}
                    </Text>
                    <Text style={styles.previewType}>
                      {accountTypeDisplayLabel}
                    </Text>
                  </View>
                  <View style={[styles.previewColorDot, {backgroundColor: customName.trim() ? accentColor : colors.border}]} />
                </View>
              </View>
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Account Name</Text>
                <TextInput
                  style={[styles.nameInput, {borderColor: accentColor + '60'}]}
                  placeholder="e.g. My Salary Account"
                  placeholderTextColor={colors.text.light}
                  value={customName}
                  onChangeText={setCustomName}
                  autoCapitalize="words"
                  maxLength={30}
                />
              </View>
            </>
          )}
        </ScrollView>
      </Animated.View>

      {/* Bottom bar */}
      <View style={[styles.bottomBar, {paddingBottom: 16 + insets.bottom}]}>

        {/* Drag handle */}
        <View style={styles.dragHandleWrapper} {...dragPanResponder.panHandlers}>
          <View style={styles.dragHandle} />
        </View>

        <Text style={styles.sectionLabel}>{mode === 'tag' ? 'Category' : 'Icon'}</Text>

        {/* Animated container — fixed height, clips content */}
        <Animated.View style={[styles.categoryContainer, {height: containerH}]}>

          {/* Horizontal scroll — visible when collapsed */}
          <Animated.View style={[styles.categoryLayer, {opacity: scrollOpacity}]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagScrollContent}>
              {mode === 'tag'
                ? tags.map(item => <TagPill key={item.tag} item={item} onPress={() => handleTagSelect(item)} />)
                : MANUAL_ICONS.map(item => {
                    const isSel = selectedIcon === item.icon;
                    return (
                      <TouchableOpacity
                        key={item.tag}
                        style={[styles.iconTagItem, {borderColor: isSel ? item.color : colors.border, backgroundColor: isSel ? item.color : colors.card}]}
                        onPress={() => setSelectedIcon(item.icon)}
                        activeOpacity={0.75}>
                        {renderAccountIcon(item.icon, 22, isSel ? colors.white : item.color)}
                      </TouchableOpacity>
                    );
                  })
              }
            </ScrollView>
          </Animated.View>

          {/* Grid — absolute overlay, visible when expanded, scrollable */}
          <Animated.View style={[styles.categoryLayer, styles.categoryGridOverlay, {opacity: gridOpacity}]} pointerEvents={expanded ? 'auto' : 'none'}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.tagGrid}>
                {mode === 'tag'
                  ? tags.map(item => <TagPill key={item.tag} item={item} onPress={() => handleTagSelect(item)} />)
                  : MANUAL_ICONS.map(item => {
                      const isSel = selectedIcon === item.icon;
                      return (
                        <TouchableOpacity
                          key={item.tag}
                          style={[styles.iconTagItem, {borderColor: isSel ? item.color : colors.border, backgroundColor: isSel ? item.color : colors.card}]}
                          onPress={() => setSelectedIcon(item.icon)}
                          activeOpacity={0.75}>
                          {renderAccountIcon(item.icon, 22, isSel ? colors.white : item.color)}
                        </TouchableOpacity>
                      );
                    })
                }
              </View>
            </ScrollView>
          </Animated.View>

        </Animated.View>

        {/* Color — both modes */}
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

        {/* Mode toggle */}
        <View style={styles.modeToggleWrapper}>
          <View style={styles.modeToggle}>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'tag' && [styles.modeBtnActive, {backgroundColor: accentColor}]]}
              onPress={() => handleModeSwitch('tag')}
              activeOpacity={0.8}>
              <Icon name="pricetag-outline" size={15} color={mode === 'tag' ? colors.white : colors.text.light} />
              <Text style={[styles.modeBtnText, mode === 'tag' && styles.modeBtnTextActive]}>Tag</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'manual' && [styles.modeBtnActive, {backgroundColor: accentColor}]]}
              onPress={() => handleModeSwitch('manual')}
              activeOpacity={0.8}>
              <Icon name="create-outline" size={15} color={mode === 'manual' ? colors.white : colors.text.light} />
              <Text style={[styles.modeBtnText, mode === 'manual' && styles.modeBtnTextActive]}>Manual</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Create button */}
        <TouchableOpacity
          style={[styles.createButton, {backgroundColor: isValid() ? accentColor : colors.border}]}
          onPress={handleCreate}
          disabled={!isValid() || loading}
          activeOpacity={0.85}>
          {loading
            ? <ActivityIndicator size="small" color={colors.white} />
            : <View style={styles.createButtonContent}>
                <Icon name="add-circle-outline" size={20} color={colors.white} />
                <Text style={styles.createButtonText}>Create Account</Text>
              </View>}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const createStyles = colors => StyleSheet.create({
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

  // Preview
  previewWrapper: {backgroundColor: colors.surfaceMuted, borderRadius: 20, padding: 16},
  previewLabel: {fontSize: 12, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10},
  previewCard: {flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 16, padding: 16, borderWidth: 1.5, borderColor: colors.border, elevation: 2, shadowColor: colors.shadow, shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.06, shadowRadius: 8, gap: 14},
  previewIconBox: {width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center'},
  previewInfo: {flex: 1},
  previewName: {fontSize: 17, fontWeight: '700', color: colors.text.primary},
  previewType: {fontSize: 13, color: colors.text.secondary, marginTop: 2},
  previewColorDot: {width: 12, height: 12, borderRadius: 6},

  // Manual
  section: {marginBottom: 20},
  sectionLabel: {fontSize: 12, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10},

  // Credit Limit
  creditLimitHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12},
  creditLimitValue: {fontSize: 16, fontWeight: '700', color: colors.text.primary},
  quickButtonsScroll: {gap: 8, paddingRight: 4, marginBottom: 16},
  quickButton: {height: 44, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center'},
  quickButtonText: {fontSize: 12, fontWeight: '700'},
  customLimitRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  customLimitLabel: {fontSize: 12, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 0.8},
  customLimitInput: {flex: 1, height: 44, backgroundColor: colors.input, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, fontSize: 14, fontWeight: '600', color: colors.text.primary},
  setButton: {paddingHorizontal: 16, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center'},
  setButtonText: {fontSize: 13, fontWeight: '700', color: colors.white},
  nameInput: {height: 52, backgroundColor: colors.input, borderWidth: 1.5, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 16, fontSize: 15, fontWeight: '600', color: colors.text.primary, elevation: 1, shadowColor: colors.shadow, shadowOffset: {width: 0, height: 1}, shadowOpacity: 0.04, shadowRadius: 4},
  iconTagRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 10},
  iconTagItem: {width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, elevation: 1},

  // Bottom bar
  bottomBar: {paddingHorizontal: 20, paddingTop: 8, backgroundColor: colors.card, elevation: 8, shadowColor: colors.shadow, shadowOffset: {width: 0, height: -2}, shadowOpacity: 0.06, shadowRadius: 12},

  // Drag handle
  dragHandleWrapper: {alignItems: 'center', paddingVertical: 8},
  dragHandle: {width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border},

  // Category expandable
  categoryContainer: {overflow: 'hidden', marginBottom: 4},
  categoryLayer: {position: 'absolute', left: 0, right: 0, top: 0},
  categoryGridOverlay: {zIndex: 1, bottom: 0},

  // Tags
  tagScrollContent: {gap: 8, paddingRight: 4, paddingBottom: 4},
  tagGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  tagPill: {flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 50, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border},
  tagPillSelected: {},
  tagIconBox: {width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center'},
  tagPillText: {fontSize: 13, fontWeight: '600', color: colors.text.secondary},
  tagPillTextSelected: {color: colors.white},

  // Color
  colorSection: {marginBottom: 12},
  colorRow: {flexDirection: 'row', gap: 12},
  colorShadow: {width: 44, height: 44, borderRadius: 22, elevation: 3, shadowColor: colors.shadow, shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.18, shadowRadius: 4},
  colorCircle: {width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center'},
  colorCircleSelected: {borderWidth: 3, borderColor: colors.card},

  // Mode toggle
  modeToggleWrapper: {alignItems: 'center', marginBottom: 12},
  modeToggle: {flexDirection: 'row', backgroundColor: colors.surfaceMuted, borderRadius: 14, padding: 4, gap: 4},
  modeBtn: {flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10},
  modeBtnActive: {elevation: 2, shadowColor: colors.shadow, shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.12, shadowRadius: 4},
  modeBtnText: {fontSize: 14, fontWeight: '600', color: colors.text.light},
  modeBtnTextActive: {color: colors.white},

  // Create button
  createButton: {height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center'},
  createButtonContent: {flexDirection: 'row', alignItems: 'center', gap: 8},
  createButtonText: {fontSize: 16, fontWeight: '700', color: colors.white, letterSpacing: 0.2},
});

export default AddAccountScreen;

