import React from 'react';
import {
  DarkTheme as NavigationDarkTheme,
  DefaultTheme as NavigationDefaultTheme,
  NavigationContainer,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

import LoginScreen from '../screens/LoginScreen';
import PreparingAppScreen from '../screens/PreparingAppScreen';
import BootScreen from '../screens/BootScreen';
import MainTabNavigator from './MainTabNavigator';
import EarningAccountScreen from '../screens/EarningAccountScreen';
import ExpensesAccountScreen from '../screens/ExpensesAccountScreen';
import CreditCardAccountScreen from '../screens/CreditCardAccountScreen';
import AmountEntryScreen from '../screens/AmountEntryScreen';
import ScheduledEntriesScreen from '../screens/ScheduledEntriesScreen';
import AddAccountScreen from '../screens/AddAccountScreen';
import PersonalizeAccountScreen from '../screens/PersonalizeAccountScreen';
import LedgerContactDetailScreen from '../screens/LedgerContactDetailScreen';
import LedgerAddContactScreen from '../screens/LedgerAddContactScreen';
import SettingsScreen from '../screens/SettingsScreen';
import BackupScreen from '../screens/BackupScreen';
import CurrencySetupScreen from '../screens/CurrencySetupScreen';
import ProfileSetupScreen from '../screens/ProfileSetupScreen';
import ProfileSettings from '../screens/ProfileSettings';
import FAQsScreen from '../screens/FAQsScreen';
import CategoryQuestionsScreen from '../screens/CategoryQuestionsScreen';
import QuestionAnswerScreen from '../screens/QuestionAnswerScreen';
import MoreScreen from '../screens/MoreScreen';
import ContactProfileScreen from '../screens/contactprofilescreen';
import HelpBotScreen from '../screens/HelpBotScreen';
import GlobalTransactionHistoryScreen from '../screens/GlobalTransactionHistoryScreen';
import {useTheme} from '../context/ThemeContext';
import {perfLog, perfNow} from '../utils/perfLogger';


const Stack = createStackNavigator();
export const navigationRef = createNavigationContainerRef();

const AppNavigator = ({onReady, onRouteChange}) => {
  const {colors, isDark} = useTheme();
  const previousRouteNameRef = React.useRef('');
  const lastRouteChangeAtRef = React.useRef(perfNow());
  const navigationTheme = React.useMemo(() => {
    const baseTheme = isDark ? NavigationDarkTheme : NavigationDefaultTheme;
    return {
      ...baseTheme,
      colors: {
        ...baseTheme.colors,
        background: colors.background,
        card: colors.card,
        text: colors.text.primary,
        border: colors.border,
        primary: colors.primary,
        notification: colors.error,
      },
    };
  }, [colors, isDark]);

  const handleNavigationReady = React.useCallback(() => {
    const initialRouteName = navigationRef.getCurrentRoute?.()?.name || '';
    previousRouteNameRef.current = String(initialRouteName || '');
    lastRouteChangeAtRef.current = perfNow();
    perfLog('navigation', 'container-ready', {
      initialRoute: previousRouteNameRef.current || 'unknown',
    });
    if (typeof onReady === 'function') {
      onReady();
    }
  }, [onReady]);

  const handleNavigationStateChange = React.useCallback(() => {
    const now = perfNow();
    const currentRouteName = String(navigationRef.getCurrentRoute?.()?.name || '');
    const previousRouteName = String(previousRouteNameRef.current || '');
    if (!currentRouteName || currentRouteName === previousRouteName) {
      return;
    }
    perfLog('navigation', 'route-change', {
      from: previousRouteName || 'unknown',
      to: currentRouteName,
      sinceLastRouteChangeMs: Math.max(0, now - lastRouteChangeAtRef.current),
    });
    previousRouteNameRef.current = currentRouteName;
    lastRouteChangeAtRef.current = now;
    if (typeof onRouteChange === 'function') {
      onRouteChange(currentRouteName, previousRouteName);
    }
  }, [onRouteChange]);

  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={handleNavigationReady}
      onStateChange={handleNavigationStateChange}
      theme={navigationTheme}>
      <Stack.Navigator
        initialRouteName="Boot"
        screenOptions={{
          headerShown: false,
          detachInactiveScreens: true,
          animation: 'slide_from_right',
          cardStyle: {backgroundColor: colors.background},
        }}>
        <Stack.Screen
          name="Boot"
          component={BootScreen}
          options={{
            animation: 'none',
          }}
        />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen
          name="PreparingApp"
          component={PreparingAppScreen}
          options={{
            animation: 'fade',
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="Home"
          component={MainTabNavigator}
          options={{
            animation: 'none',
          }}
        />
        <Stack.Screen name="AccountDetail" component={EarningAccountScreen} />
        <Stack.Screen name="ExpensesAccountDetail" component={ExpensesAccountScreen} />
        <Stack.Screen
          name="CreditCardAccountDetail"
          component={CreditCardAccountScreen}
        />
        <Stack.Screen name="MoreNative" component={MoreScreen} />
        <Stack.Screen name="ProfileSettingsNative" component={ProfileSettings} />
        <Stack.Screen name="ProfileSettings" component={ProfileSettings} />
        <Stack.Screen name="AmountEntry" component={AmountEntryScreen} />
        <Stack.Screen
          name="GlobalTransactionHistory"
          component={GlobalTransactionHistoryScreen}
        />
        <Stack.Screen name="ScheduledEntries" component={ScheduledEntriesScreen} />
        <Stack.Screen name="AddAccount" component={AddAccountScreen} />
        <Stack.Screen name="PersonalizeAccount" component={PersonalizeAccountScreen} />
        <Stack.Screen
          name="LedgerContactDetail"
          component={LedgerContactDetailScreen}
          options={{
            cardStyle: {backgroundColor: colors.background},
          }}
        />
        <Stack.Screen name="contactprofilescreen" component={ContactProfileScreen} />
        <Stack.Screen
          name="LedgerAddContact"
          component={LedgerAddContactScreen}
          
        />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            animation: 'slide_from_right',
            detachPreviousScreen: true,
          }}
        />
        <Stack.Screen name="Backup" component={BackupScreen} />
        <Stack.Screen name="CurrencySetup" component={CurrencySetupScreen} />
        <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
        <Stack.Screen name="FAQs" component={FAQsScreen} />
        <Stack.Screen name="CategoryQuestions" component={CategoryQuestionsScreen} />
        <Stack.Screen name="QuestionAnswer" component={QuestionAnswerScreen} />
        <Stack.Screen name="HelpBot" component={HelpBotScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
