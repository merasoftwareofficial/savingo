import React from 'react';
import {
  DeviceEventEmitter,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {fontSize, fontWeight, spacing, headerTexture} from '../utils/theme';
import {useTheme} from '../context/ThemeContext';
import {
  DEFAULT_HEADER_TEXTURE_ID,
  HEADER_TEXTURE_CHANGED_EVENT,
  HEADER_TEXTURE_OPTIONS,
  getResolvedHeaderTextureTheme,
  loadStoredHeaderTextureId,
  saveHeaderTextureId,
} from '../utils/headerTextureTheme';
import PageHeader from '../components/ui/PageHeader';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';

const ThemeSettingsScreen = ({navigation}) => {
  const {colors, isDark} = useTheme();
  const [selectedThemeId, setSelectedThemeId] = React.useState(
    DEFAULT_HEADER_TEXTURE_ID
  );
  const [savingThemeId, setSavingThemeId] = React.useState('');

  const styles = React.useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: colors.headerBg,
      borderBottomWidth: 1,
      borderBottomColor: headerTexture.border,
      elevation: 2,
    },
    backButton: {
      padding: 6,
    },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      fontSize: fontSize.large,
      fontWeight: fontWeight.semibold,
      color: colors.headerText,
    },
    headerSpacer: {
      width: 34,
    },
    scrollView: {
      flex: 1,
    },
    content: {
      padding: spacing.md,
      gap: spacing.md,
    },
    helperText: {
      fontSize: fontSize.medium,
      color: colors.text.secondary,
    },
    themeCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      overflow: 'hidden',
    },
    themeCardSelected: {
      borderColor: colors.primary,
      borderWidth: 1.5,
    },
    previewImage: {
      width: '100%',
      height: 140,
    },
    previewGradient: {
      width: '100%',
      height: 140,
      overflow: 'hidden',
    },
    previewGradientSvg: {
      width: '100%',
      height: '100%',
    },
    themeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    themeTitle: {
      fontSize: fontSize.medium,
      fontWeight: fontWeight.semibold,
      color: colors.text.primary,
    },
    savingText: {
      fontSize: fontSize.small,
      color: colors.text.secondary,
      fontWeight: fontWeight.medium,
    },
  }), [colors]);

  React.useEffect(() => {
    let isMounted = true;

    const loadTheme = async () => {
      const storedId = await loadStoredHeaderTextureId();
      if (isMounted) {
        setSelectedThemeId(storedId);
      }
    };

    loadTheme();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSelectTheme = async themeId => {
    if (themeId === selectedThemeId || savingThemeId) {
      return;
    }

    setSavingThemeId(themeId);
    try {
      const normalized = await saveHeaderTextureId(themeId);
      setSelectedThemeId(normalized);
      DeviceEventEmitter.emit(HEADER_TEXTURE_CHANGED_EVENT, normalized);
    } catch (error) {
      console.error('Failed to save selected theme:', error);
    } finally {
      setSavingThemeId('');
    }
  };

  return (
    <View style={styles.container}>
      <PageHeader title="Theme" onBackPress={() => navigation.goBack()} />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Text style={styles.helperText}>
          Choose a header texture for the app.
        </Text>

        {HEADER_TEXTURE_OPTIONS.map(option => {
          const isSelected = option.id === selectedThemeId;
          const isSaving = option.id === savingThemeId;
          const isGradientTheme = option.type === 'gradient';
          const previewTheme = getResolvedHeaderTextureTheme(option.id, isDark);
          return (
            <TouchableOpacity
              key={option.id}
              style={[
                styles.themeCard,
                isSelected && [
                  styles.themeCardSelected,
                  {borderColor: previewTheme.accentPrimary},
                ],
              ]}
              activeOpacity={0.85}
              onPress={() => handleSelectTheme(option.id)}>
              {isGradientTheme ? (
                <View style={styles.previewGradient}>
                  <Svg
                    width="100%"
                    height="100%"
                    style={styles.previewGradientSvg}>
                    <Defs>
                      <LinearGradient
                        id={`themePreview_${option.id}`}
                        x1="0%"
                        y1="0%"
                        x2="0%"
                        y2="100%">
                        <Stop
                          offset="0%"
                          stopColor={previewTheme.headerGradientStart}
                        />
                        <Stop
                          offset="100%"
                          stopColor={previewTheme.headerGradientEnd}
                        />
                      </LinearGradient>
                    </Defs>
                    <Rect
                      x="0"
                      y="0"
                      width="100%"
                      height="100%"
                      fill={`url(#themePreview_${option.id})`}
                    />
                  </Svg>
                </View>
              ) : (
                <Image source={option.image} style={styles.previewImage} />
              )}
              <View style={styles.themeRow}>
                <Text style={styles.themeTitle}>{option.title}</Text>
                {isSaving ? (
                  <Text style={styles.savingText}>Saving...</Text>
                ) : isSelected ? (
                  <Icon name="checkmark-circle" size={20} color={colors.primary} />
                ) : (
                  <Icon
                    name="ellipse-outline"
                    size={20}
                    color={colors.text.light}
                  />
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

export default ThemeSettingsScreen;
