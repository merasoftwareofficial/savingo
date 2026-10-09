import {useMemo} from 'react';
import {useTheme} from '../context/ThemeContext';
import {useHeaderTextureTheme} from '../context/HeaderTextureContext';
import {
  DEFAULT_HEADER_TEXTURE_ID,
  getResolvedHeaderTextureTheme,
  normalizeHeaderTextureId,
  resolveAccentPalette,
} from '../utils/headerTextureTheme';

export const useResolvedHeaderTextureVariant = themeIdOverride => {
  const {isDark} = useTheme();
  const {themeId} = useHeaderTextureTheme();
  const effectiveThemeId =
    themeIdOverride !== undefined
      ? normalizeHeaderTextureId(themeIdOverride)
      : themeId || DEFAULT_HEADER_TEXTURE_ID;

  return useMemo(
    () => getResolvedHeaderTextureTheme(effectiveThemeId, isDark),
    [effectiveThemeId, isDark],
  );
};

export const useAdaptiveAccent = (startColor, endColor = startColor) => {
  const {isDark} = useTheme();
  return useMemo(
    () => resolveAccentPalette(startColor, endColor, isDark),
    [startColor, endColor, isDark],
  );
};
