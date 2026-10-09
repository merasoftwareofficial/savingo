import React from 'react';
import {createStackNavigator} from '@react-navigation/stack';

import LedgerScreen from '../screens/LedgerScreen';

const Stack = createStackNavigator();

const LedgerStackNavigator = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        detachInactiveScreens: true,
        animation: 'slide_from_right',
      }}>
      <Stack.Screen name="LedgerHome" component={LedgerScreen} />
    </Stack.Navigator>
  );
};

export default LedgerStackNavigator;
