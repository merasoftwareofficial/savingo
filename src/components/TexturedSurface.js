import React from 'react';
import {
  ImageBackground,
  StyleSheet,
  View,
} from 'react-native';
import {headerTexture} from '../utils/theme';
import {
  getHeaderTextureSource,
  normalizeHeaderTextureId,
  resolveAccentPalette,
} from '../utils/headerTextureTheme';
import {useHeaderTextureTheme} from '../context/HeaderTextureContext';
import {useTheme} from '../context/ThemeContext';
import {useResolvedHeaderTextureVariant} from '../hooks/useAdaptiveThemeAccent';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';

const TexturedSurface = ({
  style,
  children,
  textureSource,
  themeId,
  gradientStart,
  gradientEnd,
}) => {
  const {themeId: globalThemeId} = useHeaderTextureTheme();
  const {colors, isDark} = useTheme();
  const effectiveThemeId =
    themeId !== undefined ? normalizeHeaderTextureId(themeId) : globalThemeId;
  const resolvedTheme = useResolvedHeaderTextureVariant(effectiveThemeId);
  const resolvedSource = textureSource || getHeaderTextureSource(effectiveThemeId);
  const explicitAccent = React.useMemo(
    () =>
      gradientStart
        ? resolveAccentPalette(gradientStart, gradientEnd || gradientStart, isDark)
        : null,
    [gradientStart, gradientEnd, isDark],
  );
  const resolvedGradientStart =
    explicitAccent?.headerGradientStart || resolvedTheme?.headerGradientStart;
  const resolvedGradientEnd =
    explicitAccent?.headerGradientEnd || resolvedTheme?.headerGradientEnd;
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const gradientId = `themeGradient_${String(
    resolvedGradientStart || resolvedTheme?.id || 'default'
  ).replace(/[^a-zA-Z0-9]/g, '')}_${String(
    resolvedGradientEnd || resolvedTheme?.id || 'default'
  ).replace(/[^a-zA-Z0-9]/g, '')}`;

  const renderGradient = () => {
    if (!resolvedGradientStart || !resolvedGradientEnd) {
      return null;
    }

    return (
      <View
        style={[styles.textureImage, {opacity: headerTexture.imageOpacity}]}
        pointerEvents="none">
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFillObject}>
          <Defs>
            <LinearGradient
              id={gradientId}
              x1="0%"
              y1="0%"
              x2="0%"
              y2="100%">
              <Stop offset="0%" stopColor={resolvedGradientStart} />
              <Stop offset="100%" stopColor={resolvedGradientEnd} />
            </LinearGradient>
          </Defs>
          <Rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill={`url(#${gradientId})`}
          />
        </Svg>
      </View>
    );
  };

  return (
    <View style={[styles.container, style]}>
      {(resolvedGradientStart && resolvedGradientEnd) && !textureSource
        ? renderGradient()
        : resolvedSource && (
            <ImageBackground
              source={resolvedSource}
              resizeMode="cover"
              style={styles.textureImage}
              imageStyle={styles.textureImage}
            />
          )}
      {children}
    </View>
  );
};

const createStyles = colors => StyleSheet.create({
  container: {
    backgroundColor: colors.headerBg,
    overflow: 'hidden',
  },
  textureImage: {
    ...StyleSheet.absoluteFillObject,
    opacity: headerTexture.imageOpacity,
  },
});

export default TexturedSurface;
