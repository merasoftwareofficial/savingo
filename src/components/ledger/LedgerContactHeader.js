import React from 'react';
import {Image, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

const LedgerContactHeader = ({
  styles,
  headerTexture,
  onBackPress,
  onProfilePress,
  onMenuPress,
  headerAvatarUri,
  headerInitial,
  contactName,
  headerPhone,
  menuButtonRef,
}) => (
  <>
    <TouchableOpacity style={styles.backButton} onPress={onBackPress}>
      <Icon name="chevron-back" size={22} color={headerTexture.icon} />
    </TouchableOpacity>
    <TouchableOpacity
      style={styles.headerIdentity}
      activeOpacity={0.8}
      onPress={onProfilePress}>
      <View style={styles.headerAvatar}>
        {headerAvatarUri ? (
          <Image
            source={{uri: headerAvatarUri}}
            style={styles.headerAvatarImage}
            resizeMode="cover"
          />
        ) : (
          <Text style={styles.headerAvatarText}>{headerInitial}</Text>
        )}
      </View>
      <View style={styles.headerTitleBlock}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {contactName}
        </Text>
        {headerPhone ? (
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {headerPhone}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
    <View ref={menuButtonRef} collapsable={false}>
      <TouchableOpacity
        style={styles.menuButton}
        onPress={onMenuPress}
        accessibilityRole="button"
        accessibilityLabel="Contact menu"
        activeOpacity={0.8}>
        <Icon name="ellipsis-vertical" size={24} color={headerTexture.icon} />
      </TouchableOpacity>
    </View>
  </>
);

export default React.memo(LedgerContactHeader);
