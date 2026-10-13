import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import TexturedSurface from '../TexturedSurface';
import {useTheme} from '../../context/ThemeContext';
import {fontSize, fontWeight, spacing} from '../../utils/theme';

const PageHeader = ({
  title = '',
  subtitle = '',
  onBackPress,
  rightSlot = null,
  variant = 'textured',
  backIconName = 'chevron-back',
  backIconSize = 22,
  backIconColor,
  titleColor,
  subtitleColor,
  containerStyle,
  contentStyle,
  backButtonStyle,
  titleBlockStyle,
  titleStyle,
  subtitleStyle,
  rightSlotStyle,
  spacerWidth = 32,
  accessibilityLabel = 'Go back',
}) => {
  const insets = useSafeAreaInsets();
  const {colors} = useTheme();
  const styles = React.useMemo(() => createStyles(), []);
  const isSolid = variant === 'solid';
  const headerIconColor =
    backIconColor || (isSolid ? colors.text.primary : colors.headerIcon);
  const headerTitleColor =
    titleColor || (isSolid ? colors.text.primary : colors.headerText);
  const headerSubtitleColor =
    subtitleColor || (isSolid ? colors.text.secondary : colors.headerSubtext);
  const HeaderContainer = isSolid ? View : TexturedSurface;
  const headerContainerStyle = [
    isSolid ? styles.solidHeader : styles.texturedHeader,
    {
      paddingTop: 42 + insets.top,
      marginTop: isSolid ? 0 : -insets.top,
      backgroundColor: isSolid ? colors.surface : undefined,
      borderBottomColor: isSolid ? colors.border : colors.headerBorder,
    },
    containerStyle,
  ];

  return (
    <HeaderContainer style={headerContainerStyle}>
      <TouchableOpacity
        style={[styles.backButton, backButtonStyle]}
        onPress={onBackPress}
        accessibilityLabel={accessibilityLabel}>
        <Icon name={backIconName} size={backIconSize} color={headerIconColor} />
      </TouchableOpacity>

      <View style={[styles.headerTitleBlock, titleBlockStyle, contentStyle]}>
        <Text style={[styles.title, {color: headerTitleColor}, titleStyle]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={[styles.subtitle, {color: headerSubtitleColor}, subtitleStyle]}
            numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {rightSlot ? (
        <View style={[styles.rightSlot, rightSlotStyle]}>{rightSlot}</View>
      ) : (
        <View style={[styles.headerSpacer, {width: spacerWidth}]} />
      )}
    </HeaderContainer>
  );
};

const createStyles = () =>
  StyleSheet.create({
    texturedHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
      borderBottomWidth: 1,
    },
    solidHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
      borderBottomWidth: 1,
    },
    backButton: {
      padding: spacing.xs,
    },
    headerTitleBlock: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.sm,
    },
    title: {
      flexShrink: 1,
      fontSize: fontSize.large,
      fontWeight: fontWeight.semibold,
      textAlign: 'center',
    },
    subtitle: {
      marginTop: 2,
      fontSize: 12,
      fontWeight: fontWeight.medium,
      textAlign: 'center',
    },
    headerSpacer: {
      width: 32,
    },
    rightSlot: {
      minWidth: 32,
      alignItems: 'flex-end',
    },
  });

export default React.memo(PageHeader);
