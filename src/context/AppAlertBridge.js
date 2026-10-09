import {Alert} from 'react-native';

let appAlertHandler = null;

export const setAppAlertHandler = handler => {
  appAlertHandler = typeof handler === 'function' ? handler : null;
};

export const showAppAlert = (title, message, actions) => {
  const safeActions =
    Array.isArray(actions) && actions.length
      ? actions.map(action => ({
          text: String(action?.text || 'OK'),
          style: action?.style || 'default',
          onPress: action?.onPress,
        }))
      : [{text: 'OK'}];

  if (appAlertHandler) {
    appAlertHandler({
      title: String(title || ''),
      message: String(message || ''),
      actions: safeActions,
    });
    return;
  }

  Alert.alert(String(title || ''), String(message || ''), safeActions);
};
