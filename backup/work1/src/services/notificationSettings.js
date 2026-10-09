import AsyncStorage from '@react-native-async-storage/async-storage';

const NOTIFICATION_SETTINGS_KEY = 'notificationSettings';

const DEFAULT_SETTINGS = {
  // Global settings
  enableAll: true,
  sound: true,
  vibration: true,
  showPreview: true,

  // Quiet hours
  quietHoursEnabled: false,
  quietHoursStart: '22:00', // 10 PM
  quietHoursEnd: '08:00', // 8 AM

  // Categories
  categories: {
    transactions: {
      enabled: true,
      sound: true,
      vibration: true,
    },
    billsReminders: {
      enabled: true,
      sound: true,
      vibration: true,
    },
    budgetAlerts: {
      enabled: true,
      sound: false,
      vibration: true,
    },
    lowBalance: {
      enabled: true,
      sound: true,
      vibration: true,
      threshold: 1000, // Default amount
    },
    backupAlerts: {
      enabled: true,
      sound: false,
      vibration: false,
    },
  },
};

class NotificationSettingsService {
  /**
   * Get all notification settings
   */
  async getSettings() {
    try {
      const stored = await AsyncStorage.getItem(NOTIFICATION_SETTINGS_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
      return DEFAULT_SETTINGS;
    } catch (error) {
      console.error('Error getting notification settings:', error);
      return DEFAULT_SETTINGS;
    }
  }

  /**
   * Save notification settings
   */
  async saveSettings(settings) {
    try {
      await AsyncStorage.setItem(
        NOTIFICATION_SETTINGS_KEY,
        JSON.stringify(settings),
      );
      return true;
    } catch (error) {
      console.error('Error saving notification settings:', error);
      return false;
    }
  }

  /**
   * Update a single setting
   */
  async updateSetting(path, value) {
    try {
      const settings = await this.getSettings();
      const keys = path.split('.');
      let obj = settings;

      // Navigate to the nested property
      for (let i = 0; i < keys.length - 1; i++) {
        obj = obj[keys[i]];
      }

      // Update the value
      obj[keys[keys.length - 1]] = value;

      await this.saveSettings(settings);
      return true;
    } catch (error) {
      console.error('Error updating setting:', error);
      return false;
    }
  }

  /**
   * Check if notifications are enabled globally
   */
  async isNotificationsEnabled() {
    const settings = await this.getSettings();
    return settings.enableAll;
  }

  /**
   * Check if specific category is enabled
   */
  async isCategoryEnabled(category) {
    const settings = await this.getSettings();
    return settings.categories[category]?.enabled ?? true;
  }

  /**
   * Check if current time is in quiet hours
   */
  async isQuietHours() {
    const settings = await this.getSettings();

    if (!settings.quietHoursEnabled) {
      return false;
    }

    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes(),
    ).padStart(2, '0')}`;

    const startTime = settings.quietHoursStart;
    const endTime = settings.quietHoursEnd;

    // If start time is greater than end time (e.g., 22:00 to 08:00)
    if (startTime > endTime) {
      return currentTime >= startTime || currentTime < endTime;
    }

    // Normal case (e.g., 09:00 to 17:00)
    return currentTime >= startTime && currentTime < endTime;
  }

  /**
   * Check if should send notification based on category and settings
   */
  async shouldSendNotification(category) {
    // Check global enable
    const globalEnabled = await this.isNotificationsEnabled();
    if (!globalEnabled) {
      return false;
    }

    // Check category enable
    const categoryEnabled = await this.isCategoryEnabled(category);
    if (!categoryEnabled) {
      return false;
    }

    // Check quiet hours
    const inQuietHours = await this.isQuietHours();
    if (inQuietHours) {
      return false;
    }

    return true;
  }

  /**
   * Get notification options for a category
   */
  async getNotificationOptions(category) {
    const settings = await this.getSettings();
    const categorySettings = settings.categories[category];

    return {
      sound: categorySettings?.sound ?? true,
      vibration: categorySettings?.vibration ?? true,
      showPreview: settings.showPreview ?? true,
    };
  }

  /**
   * Get low balance threshold
   */
  async getLowBalanceThreshold() {
    const settings = await this.getSettings();
    return settings.categories.lowBalance?.threshold ?? 1000;
  }

  /**
   * Reset to default settings
   */
  async resetToDefaults() {
    try {
      await this.saveSettings(DEFAULT_SETTINGS);
      return true;
    } catch (error) {
      console.error('Error resetting settings:', error);
      return false;
    }
  }
}

export const notificationSettingsService = new NotificationSettingsService();
