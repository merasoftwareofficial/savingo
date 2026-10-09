import React from 'react';
import {Switch} from 'react-native';

const ToggleSwitch = ({
  value,
  onValueChange,
  disabled = false,
  trackColor,
  thumbColor,
  ios_backgroundColor,
  ...rest
}) => {
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={trackColor}
      thumbColor={thumbColor}
      ios_backgroundColor={ios_backgroundColor}
      {...rest}
    />
  );
};

export default ToggleSwitch;
