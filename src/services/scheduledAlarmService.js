import {NativeModules, Platform} from 'react-native';

const nativeModule = NativeModules.ScheduledAlarm || null;

const isAndroid = Platform.OS === 'android';

const canUseNativeAlarms = () =>
  isAndroid && nativeModule && typeof nativeModule.scheduleExact === 'function';

export const scheduleNativeAlarm = async (scheduleId, triggerAt) => {
  if (!canUseNativeAlarms()) {
    return false;
  }
  const normalizedId = Number(scheduleId);
  const normalizedTriggerAt = Number(triggerAt);
  if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
    return false;
  }
  if (!Number.isFinite(normalizedTriggerAt) || normalizedTriggerAt <= 0) {
    return false;
  }
  try {
    return await nativeModule.scheduleExact(normalizedId, normalizedTriggerAt);
  } catch (error) {
    console.error('Failed to schedule native alarm:', error);
    return false;
  }
};

export const cancelNativeAlarm = async scheduleId => {
  if (!canUseNativeAlarms()) {
    return false;
  }
  const normalizedId = Number(scheduleId);
  if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
    return false;
  }
  try {
    await nativeModule.cancel(normalizedId);
    return true;
  } catch (error) {
    console.error('Failed to cancel native alarm:', error);
    return false;
  }
};

export const canScheduleExactAlarms = async () => {
  if (!isAndroid) {
    return true;
  }
  if (!nativeModule || typeof nativeModule.canScheduleExactAlarms !== 'function') {
    return false;
  }
  try {
    return await nativeModule.canScheduleExactAlarms();
  } catch (error) {
    console.error('Failed to check exact alarm permission:', error);
    return false;
  }
};

export const openExactAlarmSettings = async () => {
  if (!isAndroid) {
    console.log('[SCHEDULE_ALARM][OPEN_SETTINGS] non-android, returning true');
    return true;
  }
  if (!nativeModule || typeof nativeModule.openExactAlarmSettings !== 'function') {
    console.log('[SCHEDULE_ALARM][OPEN_SETTINGS] native module unavailable');
    return false;
  }
  try {
    console.log('[SCHEDULE_ALARM][OPEN_SETTINGS] invoking native settings open');
    const opened = await nativeModule.openExactAlarmSettings();
    console.log('[SCHEDULE_ALARM][OPEN_SETTINGS] native result:', opened);
    return opened;
  } catch (error) {
    console.error('Failed to open exact alarm settings:', error);
    return false;
  }
};
