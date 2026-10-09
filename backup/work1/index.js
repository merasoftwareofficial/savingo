/**
 * @format
 */

import 'react-native-gesture-handler';
import { AppRegistry } from 'react-native';
import notifee from '@notifee/react-native';
import messaging from '@react-native-firebase/messaging';
import App from './App';
import { name as appName } from './app.json';
import {processChatNotificationAction} from './src/services/chatNotificationActionService';
import {handleIncomingMessage} from './src/services/messagingService';
import {
  SCHEDULE_PROCESSING_TASK,
  runScheduledProcessingTask,
} from './src/services/scheduleProcessingService';

const startupGlobal = global;
startupGlobal.__startupTimestamps = startupGlobal.__startupTimestamps || {};

if (!startupGlobal.__startupTimestamps.jsEntry) {
  startupGlobal.__startupTimestamps.jsEntry = Date.now();
}

if (__DEV__) {
  console.log('[STARTUP][JS] bundle entry loaded');
}

notifee.onBackgroundEvent(async event => {
  try {
    await processChatNotificationAction(event, {
      source: 'background',
    });
  } catch (error) {
    console.error('[CHAT_NOTIF_V2] background action handling failed:', error);
  }
});

messaging().setBackgroundMessageHandler(async remoteMessage => {
  try {
    if (__DEV__) {
      console.log('[FCM_BG_ENTRY] background message received', {
        messageId: String(remoteMessage?.messageId || ''),
        hasData: Boolean(remoteMessage?.data),
        hasNotification: Boolean(remoteMessage?.notification),
      });
    }
    await handleIncomingMessage(remoteMessage);
  } catch (error) {
    console.error('[FCM_BG_ENTRY] background message handling failed:', error);
  }
});

AppRegistry.registerHeadlessTask(
  SCHEDULE_PROCESSING_TASK,
  () => runScheduledProcessingTask,
);

AppRegistry.registerComponent(appName, () => {
  if (!startupGlobal.__startupTimestamps.registerComponentFactory) {
    startupGlobal.__startupTimestamps.registerComponentFactory = Date.now();
  }
  if (__DEV__) {
    const base = startupGlobal.__startupTimestamps.jsEntry;
    console.log(
      `[STARTUP][JS] registerComponent factory invoked: ${Date.now() - base}ms`,
    );
  }
  return App;
});
