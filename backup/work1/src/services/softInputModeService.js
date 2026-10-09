import {Platform} from 'react-native';
import {AvoidSoftInput} from 'react-native-avoid-softinput';

const isAndroid = Platform.OS === 'android';

const callNative = methodName => {
  if (!isAndroid || !AvoidSoftInput || typeof AvoidSoftInput[methodName] !== 'function') {
    return false;
  }
  try {
    AvoidSoftInput[methodName]();
    return true;
  } catch (error) {
    if (__DEV__) {
      console.warn(`Failed to apply soft input mode ${methodName}:`, error);
    }
    return false;
  }
};

export const setSoftInputAdjustPan = () => callNative('setAdjustPan');

export const clearSoftInputModeOverride = () => callNative('setAdjustResize');
