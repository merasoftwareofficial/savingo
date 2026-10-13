import React from 'react';
import {Switch} from 'react-native';
import {useTheme} from '../../context/ThemeContext';

// Colours come from the light/dark theme so every switch in the app looks the same.
const ToggleSwitch = ({
  value,
  onValueChange,
  disabled = false,
  ...rest
}) => {
  const {colors} = useTheme();
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{false: colors.switchTrackOff, true: colors.switchTrackOn}}
      thumbColor={value ? colors.switchThumbOn : colors.switchThumbOff}
      ios_backgroundColor={colors.switchTrackOff}
      {...rest}
    />
  );
};

export default ToggleSwitch;
