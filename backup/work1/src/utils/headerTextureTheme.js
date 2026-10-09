import AsyncStorage from '@react-native-async-storage/async-storage';

export const HEADER_TEXTURE_STORAGE_KEY = 'headerTextureThemeId';
export const HEADER_TEXTURE_CHANGED_EVENT = 'headerTexture:changed';
export const DEFAULT_HEADER_TEXTURE_ID = 'theme-5';

export const HEADER_TEXTURE_OPTIONS = [
  {
    id: 'theme-5',
    title: 'Azure',
    type: 'gradient',
    gradientStart: '#38BDF8',
    gradientEnd: '#0369A1',
  },
  {
    id: 'theme-2',
    title: 'Crimson',
    type: 'gradient',
    gradientStart: '#DC2626',
    gradientEnd: '#7F1D1D',
  },
  {
    id: 'theme-17',
    title: 'Cyan',
    type: 'gradient',
    gradientStart: '#31CECE',
    gradientEnd: '#31CECE',
  },
  {
    id: 'theme-30',
    title: 'Dark',
    type: 'gradient',
    gradientStart: '#242A33',
    gradientEnd: '#242A33',
    lockPaletteAcrossModes: true,
  },
  {
    id: 'theme-16',
    title: 'Dark Blue',
    type: 'gradient',
    gradientStart: '#0045AC',
    gradientEnd: '#0045AC',
  },
  {
    id: 'theme-29',
    title: 'Dark Gray',
    type: 'gradient',
    gradientStart: '#555555',
    gradientEnd: '#555555',
  },
  {
    id: 'theme-4',
    title: 'Flamingo',
    type: 'gradient',
    gradientStart: '#F472B6',
    gradientEnd: '#BE185D',
  },
  {
    id: 'theme-1',
    title: 'Forest',
    type: 'gradient',
    gradientStart: '#059669',
    gradientEnd: '#064E3B',
  },
  {
    id: 'theme-12',
    title: 'Lagoon',
    type: 'gradient',
    gradientStart: '#22D3EE',
    gradientEnd: '#164E63',
  },
  {
    id: 'theme-15',
    title: 'Light Blue',
    type: 'gradient',
    gradientStart: '#74B8FC',
    gradientEnd: '#74B8FC',
  },
  {
    id: 'theme-3',
    title: 'Navy',
    type: 'gradient',
    gradientStart: '#2563EB',
    gradientEnd: '#1E3A8A',
  },
  {
    id: 'theme-25',
    title: 'Purple',
    type: 'gradient',
    gradientStart: '#6F3CA2',
    gradientEnd: '#6F3CA2',
  },
  {
    id: 'theme-7',
    title: 'Royal',
    type: 'gradient',
    gradientStart: '#7C3AED',
    gradientEnd: '#3B0764',
  },
  {
    id: 'theme-6',
    title: 'Seafoam',
    type: 'gradient',
    gradientStart: '#6EE7B7',
    gradientEnd: '#0F766E',
  },
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const normalizeHex = value => {
  const raw = String(value || '').trim();
  if (!raw) {
    return null;
  }
  const hex = raw.startsWith('#') ? raw.slice(1) : raw;
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    return `#${hex
      .split('')
      .map(char => char + char)
      .join('')
      .toUpperCase()}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return `#${hex.toUpperCase()}`;
  }
  return null;
};

const hexToRgb = value => {
  const normalized = normalizeHex(value);
  if (!normalized) {
    return null;
  }
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
};

const rgbToHex = ({r, g, b}) =>
  `#${[r, g, b]
    .map(channel =>
      clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0'),
    )
    .join('')
    .toUpperCase()}`;

const rgbToHsl = ({r, g, b}) => {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;

  if (max === min) {
    return {h: 0, s: 0, l: lightness * 100};
  }

  const delta = max - min;
  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue = 0;

  switch (max) {
    case red:
      hue = (green - blue) / delta + (green < blue ? 6 : 0);
      break;
    case green:
      hue = (blue - red) / delta + 2;
      break;
    default:
      hue = (red - green) / delta + 4;
      break;
  }

  return {
    h: hue * 60,
    s: saturation * 100,
    l: lightness * 100,
  };
};

const hueToRgb = (p, q, t) => {
  let next = t;
  if (next < 0) {
    next += 1;
  }
  if (next > 1) {
    next -= 1;
  }
  if (next < 1 / 6) {
    return p + (q - p) * 6 * next;
  }
  if (next < 1 / 2) {
    return q;
  }
  if (next < 2 / 3) {
    return p + (q - p) * (2 / 3 - next) * 6;
  }
  return p;
};

const hslToRgb = ({h, s, l}) => {
  const hue = ((h % 360) + 360) % 360 / 360;
  const saturation = clamp(s, 0, 100) / 100;
  const lightness = clamp(l, 0, 100) / 100;

  if (saturation === 0) {
    const gray = lightness * 255;
    return {r: gray, g: gray, b: gray};
  }

  const q =
    lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;

  return {
    r: hueToRgb(p, q, hue + 1 / 3) * 255,
    g: hueToRgb(p, q, hue) * 255,
    b: hueToRgb(p, q, hue - 1 / 3) * 255,
  };
};

const blendHex = (start, end, ratio = 0.5) => {
  const startRgb = hexToRgb(start);
  const endRgb = hexToRgb(end);
  if (!startRgb) {
    return normalizeHex(end) || '#059669';
  }
  if (!endRgb) {
    return normalizeHex(start) || '#059669';
  }
  const mix = clamp(ratio, 0, 1);
  return rgbToHex({
    r: startRgb.r + (endRgb.r - startRgb.r) * mix,
    g: startRgb.g + (endRgb.g - startRgb.g) * mix,
    b: startRgb.b + (endRgb.b - startRgb.b) * mix,
  });
};

const getRelativeLuminance = value => {
  const rgb = hexToRgb(value);
  if (!rgb) {
    return 0;
  }
  const transform = channel => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };

  const red = transform(rgb.r);
  const green = transform(rgb.g);
  const blue = transform(rgb.b);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

const adaptAccentForDarkMode = value => {
  const rgb = hexToRgb(value);
  if (!rgb) {
    return '#2F6FDD';
  }
  const hsl = rgbToHsl(rgb);
  const nextLightness =
    hsl.l >= 72
      ? clamp(hsl.l * 0.48, 24, 40)
      : hsl.l >= 55
      ? clamp(hsl.l * 0.58, 24, 42)
      : clamp(hsl.l * 0.82, 24, 46);
  const nextSaturation =
    hsl.s <= 12 ? hsl.s : clamp(hsl.s * 0.84, 22, 86);
  return rgbToHex(
    hslToRgb({
      h: hsl.h,
      s: nextSaturation,
      l: nextLightness,
    }),
  );
};

export const withAlpha = (value, alpha) => {
  const rgb = hexToRgb(value);
  if (!rgb) {
    return `rgba(0,0,0,${alpha})`;
  }
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${clamp(alpha, 0, 1)})`;
};

const getContrastColor = value =>
  getRelativeLuminance(value) > 0.54 ? '#0F172A' : '#FFFFFF';

const DARK_THEME_OVERRIDES = {
  // Cyan looks too bright on dark surfaces without an extra depth pass.
  'theme-17': {
    start: '#1A6B73',
    end: '#145961',
  },
};

export const resolveAccentPalette = (
  startColor,
  endColor = startColor,
  isDark = false,
) => {
  const baseStart = normalizeHex(startColor) || '#059669';
  const baseEnd = normalizeHex(endColor) || baseStart;
  const headerGradientStart = isDark
    ? adaptAccentForDarkMode(baseStart)
    : baseStart;
  const headerGradientEnd = isDark
    ? adaptAccentForDarkMode(baseEnd)
    : baseEnd;
  const accentPrimary = blendHex(headerGradientStart, headerGradientEnd, 0.35);
  const accentSelection = isDark
    ? blendHex(accentPrimary, '#FFFFFF', 0.4)
    : accentPrimary;

  return {
    accentPrimary,
    accentSelection,
    accentPrimarySoft: withAlpha(accentPrimary, isDark ? 0.22 : 0.14),
    accentPrimaryMuted: withAlpha(accentPrimary, isDark ? 0.34 : 0.2),
    accentContrast: getContrastColor(accentPrimary),
    headerGradientStart,
    headerGradientEnd,
    ring: withAlpha(accentPrimary, isDark ? 0.42 : 0.24),
  };
};

const HEADER_TEXTURE_THEME_BY_ID = HEADER_TEXTURE_OPTIONS.reduce(
  (acc, option) => {
    acc[option.id] = option;
    return acc;
  },
  {},
);

const LEGACY_HEADER_TEXTURE_IDS = {
  'texture-default': 'theme-4',
  'texture-1': 'theme-5',
  'texture-2': 'theme-6',
  'texture-3': 'theme-5',
  'texture-4': 'theme-6',
  'texture-5': 'theme-7',
  'texture-6': 'theme-8',
};

export const normalizeHeaderTextureId = value => {
  const normalizedValue = HEADER_TEXTURE_THEME_BY_ID[value]
    ? value
    : LEGACY_HEADER_TEXTURE_IDS[value];
  return HEADER_TEXTURE_THEME_BY_ID[normalizedValue]
    ? normalizedValue
    : DEFAULT_HEADER_TEXTURE_ID;
};

export const getHeaderTextureTheme = value => {
  const normalized = normalizeHeaderTextureId(value);
  return HEADER_TEXTURE_THEME_BY_ID[normalized];
};

export const getResolvedHeaderTextureTheme = (value, isDark = false) => {
  const theme = getHeaderTextureTheme(value);
  if (!theme) {
    return {
      id: DEFAULT_HEADER_TEXTURE_ID,
      title: 'Azure',
      type: 'gradient',
      ...resolveAccentPalette('#38BDF8', '#0369A1', isDark),
    };
  }
  const shouldLockPaletteAcrossModes = theme.lockPaletteAcrossModes === true;
  const darkOverride =
    !shouldLockPaletteAcrossModes && isDark ? DARK_THEME_OVERRIDES[theme.id] : null;
  const palette = resolveAccentPalette(
    darkOverride?.start || theme.gradientStart,
    darkOverride?.end || theme.gradientEnd,
    shouldLockPaletteAcrossModes ? false : isDark,
  );
  const allNightSelectionColor =
    theme.id === 'theme-30' ? (isDark ? '#FFFFFF' : '#000000') : null;

  return {
    ...theme,
    ...palette,
    accentSelection:
      theme.accentSelection || allNightSelectionColor || palette.accentSelection,
    titleColor: theme.titleColor || '#FFFFFF',
    iconColor: theme.iconColor || '#FFFFFF',
    statusBarStyle: theme.statusBarStyle || 'light-content',
    surfaceTone: theme.surfaceTone || palette.accentPrimarySoft,
    surfaceToneStrong: theme.surfaceToneStrong || palette.accentPrimaryMuted,
    selectionTone: theme.selectionTone || palette.accentSelection,
    borderTone: theme.borderTone || palette.ring,
    mutedTone: theme.mutedTone || theme.borderTone || palette.ring,
  };
};

export const getHeaderTextureSource = value => {
  const theme = getHeaderTextureTheme(value);
  return theme?.type === 'image' ? theme.image : null;
};

export const loadStoredHeaderTextureId = async () => {
  try {
    const stored = await AsyncStorage.getItem(HEADER_TEXTURE_STORAGE_KEY);
    return normalizeHeaderTextureId(stored);
  } catch (error) {
    console.error('Failed to load header texture id:', error);
    return DEFAULT_HEADER_TEXTURE_ID;
  }
};

export const saveHeaderTextureId = async value => {
  const normalized = normalizeHeaderTextureId(value);
  await AsyncStorage.setItem(HEADER_TEXTURE_STORAGE_KEY, normalized);
  return normalized;
};
