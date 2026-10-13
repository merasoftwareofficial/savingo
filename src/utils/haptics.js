import {Platform, Vibration} from 'react-native';

// Light tactile feedback for primary actions. Android only (VIBRATE permission is declared).
export const hapticTap = () => {
  if (Platform.OS === 'android') {
    Vibration.vibrate(8);
  }
};
