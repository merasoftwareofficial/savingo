import React from 'react';
import {createStackNavigator} from '@react-navigation/stack';

import AllAccountsScreen from '../screens/AllAccountsScreen';

const Stack = createStackNavigator();

const DashboardStackNavigator = ({route}) => {
  const {user, showTutorial} = route.params || {};

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        detachInactiveScreens: true,
        animation: 'slide_from_right',
      }}>
      <Stack.Screen
        name="AccountsHome"
        component={AllAccountsScreen}
        initialParams={{user, showTutorial}}
      />
    </Stack.Navigator>
  );
};

export default DashboardStackNavigator;
