import {Linking, Platform} from 'react-native';
import SpInAppUpdates, {IAUUpdateKind} from 'sp-react-native-in-app-updates';

const ANDROID_PACKAGE_NAME = 'com.jasmeet.accountapp';
const PLAY_STORE_FALLBACK_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE_NAME}`;

const inAppUpdates = new SpInAppUpdates(false);

const normalizeVersion = version => {
  if (!version || typeof version !== 'string') {
    return '0.0.0';
  }
  return version.trim() || '0.0.0';
};

const isExpectedNonStoreInstallError = error => {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || error?.nativeErrorCode || '').toLowerCase();
  return (
    code === '-10' ||
    message.includes('install error(-10)') ||
    message.includes('installexception: -10') ||
    message.includes('app is not owned by any user')
  );
};

export const checkAndroidInAppUpdate = async currentVersion => {
  if (Platform.OS !== 'android') {
    return {shouldUpdate: false};
  }
  try {
    const result = await inAppUpdates.checkNeedsUpdate({
      curVersion: normalizeVersion(currentVersion),
    });
    return {
      shouldUpdate: Boolean(result?.shouldUpdate),
      storeUrl: result?.storeUrl || PLAY_STORE_FALLBACK_URL,
      storeVersion: result?.storeVersion || '',
    };
  } catch (error) {
    if (isExpectedNonStoreInstallError(error)) {
      if (__DEV__) {
        console.log(
          'Skipped in-app update check for non-PlayStore install:',
          error?.message || error
        );
      }
    } else {
      console.warn('Failed to check in-app update:', error);
    }
    return {
      shouldUpdate: false,
      storeUrl: PLAY_STORE_FALLBACK_URL,
      storeVersion: '',
      error,
    };
  }
};

export const startAndroidFlexibleUpdate = async () => {
  if (Platform.OS !== 'android') {
    return false;
  }
  try {
    await inAppUpdates.startUpdate({
      updateType: IAUUpdateKind.FLEXIBLE,
    });
    return true;
  } catch (error) {
    console.error('Failed to start in-app update:', error);
    return false;
  }
};

export const openPlayStoreForUpdate = async url => {
  const targetUrl = url || PLAY_STORE_FALLBACK_URL;
  try {
    const canOpen = await Linking.canOpenURL(targetUrl);
    if (canOpen) {
      await Linking.openURL(targetUrl);
      return true;
    }
  } catch (error) {
    console.error('Failed to open play store url:', error);
  }
  try {
    await Linking.openURL(PLAY_STORE_FALLBACK_URL);
    return true;
  } catch (error) {
    console.error('Failed to open fallback play store url:', error);
    return false;
  }
};
