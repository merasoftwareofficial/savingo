import notifee, {
  AndroidImportance,
  AndroidVisibility,
  AuthorizationStatus,
  EventType,
  TriggerType,
  RepeatFrequency,
} from '@notifee/react-native';
import {Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const REMINDER_SCHEDULED_KEY = 'notifications.expenseRemindersScheduled';
const REMINDER_IDS = ['expense-reminder-10am', 'expense-reminder-9pm'];

const isNotificationAuthorized = status =>
  status === AuthorizationStatus.AUTHORIZED ||
  status === AuthorizationStatus.PROVISIONAL;

class NotificationService {
  constructor() {
    this.configure();
  }

  configure() {
    notifee.onForegroundEvent(({type, detail}) => {
      if (type === EventType.PRESS) {
        console.log('NOTIFICATION PRESS:', detail?.notification?.id);
      }
    });
  }

  async createChannel() {
    if (Platform.OS !== 'android') {
      return null;
    }
    return notifee.createChannel({
      id: 'default',
      name: 'Default',
      description: 'Default notifications',
      importance: AndroidImportance.DEFAULT,
      visibility: AndroidVisibility.PUBLIC,
      vibration: true,
    });
  }

  async ensureExpenseRemindersScheduled() {
    const alreadyScheduled = await AsyncStorage.getItem(REMINDER_SCHEDULED_KEY);
    if (alreadyScheduled === 'true') {
      return;
    }

    await this.requestPermissions();
    const channelId = await this.createChannel();

    await notifee.cancelTriggerNotifications();

    const scheduleDaily = async (id, hour, minute) => {
      await notifee.createTriggerNotification(
        {
          id,
          title: 'Expense Reminder',
          body: 'Please note and manage your expenses today.',
          android: {
            channelId: channelId || 'default',
            pressAction: {id: 'default'},
          },
        },
        {
          type: TriggerType.TIMESTAMP,
          timestamp: NotificationService.getNextTriggerTime(hour, minute),
          repeatFrequency: RepeatFrequency.DAILY,
        },
      );
    };

    await scheduleDaily(REMINDER_IDS[0], 10, 0);
    await scheduleDaily(REMINDER_IDS[1], 21, 0);

    await AsyncStorage.setItem(REMINDER_SCHEDULED_KEY, 'true');
  }

  static getNextTriggerTime(hour, minute) {
    const now = new Date();
    const next = new Date();
    next.setHours(hour, minute, 0, 0);
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }
    return next.getTime();
  }

  async ensureLocalNotificationPermission() {
    if (Platform.OS !== 'android') {
      return true;
    }

    try {
      const settings = await notifee.getNotificationSettings();
      const currentStatus = settings?.authorizationStatus;
      if (isNotificationAuthorized(currentStatus)) {
        return true;
      }

      const requested = await notifee.requestPermission();
      return isNotificationAuthorized(requested?.authorizationStatus);
    } catch (error) {
      console.error('Local notification permission check failed:', error);
      return false;
    }
  }

  async showLocalNotification(title, message) {
    const hasPermission = await this.ensureLocalNotificationPermission();
    if (!hasPermission) {
      return false;
    }
    const channelId = await this.createChannel();
    await notifee.displayNotification({
      title: title,
      body: message,
      android: {
        channelId: channelId || 'default',
        pressAction: {id: 'default'},
      },
    });
    return true;
  }

  requestPermissions() {
    if (Platform.OS === 'android') {
      return notifee.requestPermission();
    }
    return Promise.resolve();
  }
}

export const notificationService = new NotificationService();
