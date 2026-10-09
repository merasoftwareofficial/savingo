import React from 'react';
import Ionicons from 'react-native-vector-icons/Ionicons';
import BsCashCoin from '../icons/BsCashCoin';

const AccountIcon = ({name, size = 24, color = '#000000'}) => {
  const iconName = String(name || '').trim();

  if (iconName === 'bs-cash-coin') {
    return <BsCashCoin size={size} color={color} />;
  }

  return <Ionicons name={iconName || 'wallet-outline'} size={size} color={color} />;
};

export default React.memo(AccountIcon);
