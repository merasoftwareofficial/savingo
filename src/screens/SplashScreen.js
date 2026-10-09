import React from 'react';
import {View, StyleSheet} from 'react-native';

// Legacy compatibility screen.
// Startup routing is centralized through Boot + startupCoordinator.
const SplashScreen = ({navigation}) => {
  React.useEffect(() => {
    const timeoutId = setTimeout(() => {
      navigation.replace('Boot');
    }, 0);
    return () => {
      clearTimeout(timeoutId);
    };
  }, [navigation]);

  return <View style={styles.root} />;
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#111318',
  },
});

export default SplashScreen;
