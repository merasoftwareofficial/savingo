import React from 'react';
import {StyleSheet} from 'react-native';
import {useTheme} from '../../context/ThemeContext';
import {radius} from '../../utils/theme';
import {hapticTap} from '../../utils/haptics';
import Button from './Button';

// Money action buttons (Add / Withdraw / Transfer / Paid / Get).
// `kind` picks the meaning colour and icon; everything else is the shared Button.
export const CTA_KIND_PRESETS = {
  add: {tone: 'success', iconName: 'arrow-up'},
  get: {tone: 'success', iconName: 'arrow-down'},
  withdraw: {tone: 'error', iconName: 'arrow-down'},
  paid: {tone: 'error', iconName: 'arrow-up'},
  transfer: {tone: 'neutral', iconName: 'swap-horizontal'},
};

const CTAButton = ({
  label,
  onPress,
  kind = 'add',
  iconName,
  disabled = false,
  style,
}) => {
  const {colors} = useTheme();
  const preset = CTA_KIND_PRESETS[kind] || CTA_KIND_PRESETS.add;
  const background =
    preset.tone === 'success'
      ? colors.success
      : preset.tone === 'error'
      ? colors.error
      : colors.primary;
  const foreground = preset.tone === 'neutral' ? colors.onPrimary : colors.white;

  return (
    <Button
      label={String(label || '')}
      icon={iconName || preset.iconName}
      onPress={event => {
        hapticTap();
        onPress?.(event);
      }}
      disabled={disabled}
      style={[
        styles.base,
        {backgroundColor: background, borderColor: background},
        style,
      ]}
      textStyle={{color: foreground}}
      iconColor={foreground}
    />
  );
};

const styles = StyleSheet.create({
  base: {
    alignSelf: 'center',
    borderRadius: radius.pill,
    minHeight: 48,
  },
});

export default CTAButton;
