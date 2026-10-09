import React from 'react';
import {View} from 'react-native';
import CTAButton from '../ui/ctabuttons';

const LedgerBottomActions = ({
  styles,
  bottomPadding,
  onPaidPress,
  onGetPress,
}) => (
  <View style={[styles.bottomButtons, {paddingBottom: bottomPadding}]}>
    <CTAButton
      kind="paid"
      label="Paid"
      compact
      style={styles.actionButton}
      onPress={onPaidPress}
    />
    <CTAButton
      kind="get"
      label="Get"
      compact
      style={styles.actionButton}
      onPress={onGetPress}
    />
  </View>
);

export default React.memo(LedgerBottomActions);
