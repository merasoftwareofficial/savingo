// SSOT for app colours. The app has only two looks: neutral light
// (white / light gray) and neutral dark (near-black / dark gray).
// There is no brand accent: "primary" is the strongest neutral of each mode
// and anything drawn on top of it uses "onPrimary".
// Meaning colours (error / success / warning) are the only hues.

export const lightColors = {
  primary: '#111827',
  secondary: '#374151',
  onPrimary: '#FFFFFF',
  primarySoft: 'rgba(17, 24, 39, 0.06)',
  primaryMuted: 'rgba(17, 24, 39, 0.10)',
  primaryRing: 'rgba(17, 24, 39, 0.16)',
  background: '#F4F5F7',
  surface: '#FFFFFF',
  surfaceMuted: '#F1F2F4',
  card: '#FFFFFF',
  panel: '#FFFFFF',
  panelMuted: '#F4F5F7',
  input: '#F1F2F4',
  modal: '#FFFFFF',
  overlay: 'rgba(17, 24, 39, 0.45)',
  shadow: '#000000',
  headerBg: '#FFFFFF',
  headerText: '#111827',
  headerSubtext: '#6B7280',
  headerIcon: '#111827',
  headerBorder: '#E5E7EB',
  headerChip: 'rgba(17, 24, 39, 0.05)',
  headerChipBorder: 'rgba(17, 24, 39, 0.08)',
  statusBarStyle: 'dark-content',
  switchTrackOn: '#111827',
  switchTrackOff: '#D1D5DB',
  switchThumbOn: '#FFFFFF',
  switchThumbOff: '#FFFFFF',
  white: '#FFFFFF',
  black: '#000000',
  text: {
    primary: '#111827',
    secondary: '#4B5563',
    light: '#9CA3AF',
  },
  border: '#E5E7EB',
  error: '#DC2626',
  success: '#059669',
  brandGreenLight: '#059669',
  brandGreenDark: '#065F46',
  warning: '#D97706',
  tabBarBg: '#FFFFFF',
  tabBarActive: '#111827',
  tabBarInactive: '#9CA3AF',
};

export const darkColors = {
  primary: '#F2F2F7',
  secondary: '#C7C7CC',
  onPrimary: '#0B0D12',
  primarySoft: 'rgba(242, 242, 247, 0.08)',
  primaryMuted: 'rgba(242, 242, 247, 0.14)',
  primaryRing: 'rgba(242, 242, 247, 0.22)',
  background: '#070A0F',
  surface: '#0F1319',
  surfaceMuted: '#151A22',
  card: '#131820',
  panel: '#131820',
  panelMuted: '#0D1117',
  input: '#1C2433',
  modal: '#131820',
  overlay: 'rgba(0, 0, 0, 0.62)',
  shadow: '#000000',
  headerBg: '#0F1319',
  headerText: '#F2F2F7',
  headerSubtext: '#AEAEB2',
  headerIcon: '#F2F2F7',
  headerBorder: '#1E242E',
  headerChip: 'rgba(255, 255, 255, 0.06)',
  headerChipBorder: 'rgba(255, 255, 255, 0.08)',
  statusBarStyle: 'light-content',
  switchTrackOn: '#F2F2F7',
  switchTrackOff: '#3A4250',
  switchThumbOn: '#0B0D12',
  switchThumbOff: '#AEAEB2',
  white: '#FFFFFF',
  black: '#000000',
  text: {
    primary: '#F2F2F7',
    secondary: '#AEAEB2',
    light: '#76767D',
  },
  border: '#262D38',
  error: '#FF453A',
  success: '#32D74B',
  brandGreenLight: '#32D74B',
  brandGreenDark: '#248A35',
  warning: '#FF9F0A',
  tabBarBg: '#0A0E15',
  tabBarActive: '#F5F7FB',
  tabBarInactive: '#8E95A1',
};

// Backwards-compat alias — static import still works for files not yet migrated
export const colors = lightColors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const fontSize = {
  small: 12,
  medium: 14,
  regular: 16,
  large: 18,
  xlarge: 20,
  xxlarge: 24,
  title: 32,
};

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
};

// Corner radius scale used by every card / button / sheet.
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  pill: 999,
};

// Text styles (size + weight + line height). Colour is applied by the caller.
export const typography = {
  display: {fontSize: 32, fontWeight: '700', lineHeight: 38, letterSpacing: -0.5},
  title: {fontSize: 22, fontWeight: '700', lineHeight: 28, letterSpacing: -0.3},
  heading: {fontSize: 17, fontWeight: '600', lineHeight: 22},
  body: {fontSize: 15, fontWeight: '400', lineHeight: 21},
  bodyStrong: {fontSize: 15, fontWeight: '600', lineHeight: 21},
  label: {fontSize: 13, fontWeight: '500', lineHeight: 18},
  caption: {fontSize: 12, fontWeight: '500', lineHeight: 16},
  overline: {fontSize: 11, fontWeight: '600', lineHeight: 14, letterSpacing: 0.8, textTransform: 'uppercase'},
};

// Card depth: soft shadow in light mode, hairline border in dark mode.
export const cardElevation = (colors, isDark) =>
  isDark
    ? {borderWidth: 1, borderColor: colors.border}
    : {
        borderWidth: 1,
        borderColor: colors.border,
        shadowColor: colors.shadow,
        shadowOffset: {width: 0, height: 4},
        shadowOpacity: 0.05,
        shadowRadius: 12,
        elevation: 1,
      };
