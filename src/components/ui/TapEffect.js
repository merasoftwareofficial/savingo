import React from 'react';
import {TouchableOpacity} from 'react-native';

const TapEffect = React.forwardRef(({children, ...props}, ref) => {
  return (
    <TouchableOpacity ref={ref} {...props}>
      {children}
    </TouchableOpacity>
  );
});

TapEffect.displayName = 'TapEffect';

export default TapEffect;
