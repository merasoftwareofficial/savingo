import React from 'react';
import {TextInput, TouchableOpacity} from 'react-native';
import {AvoidSoftInputView} from 'react-native-avoid-softinput';
import Icon from 'react-native-vector-icons/Ionicons';
import {spacing} from '../../utils/theme';
import {useTheme} from '../../context/ThemeContext';

const ChatComposer = ({
  styles,
  insetsBottom,
  chatInputRef,
  messageText,
  setMessageText,
  sendingMessage,
  onSendPress,
  avoidOffset,
  onComposerLayout,
  onSoftInputHeightChange,
  onSoftInputShown,
  onSoftInputHidden,
  onInputTouchStart,
  onInputFocus,
  onInputBlur,
}) => {
  const {colors} = useTheme();
  return (
    <AvoidSoftInputView
    style={[
      styles.chatInputContainer,
      {
        paddingBottom: spacing.sm + insetsBottom,
      },
    ]}
    onLayout={onComposerLayout}
    avoidOffset={avoidOffset}
    easing="linear"
    showAnimationDelay={0}
    hideAnimationDelay={0}
    showAnimationDuration={30}
    hideAnimationDuration={30}
    onSoftInputHeightChange={onSoftInputHeightChange}
    onSoftInputShown={onSoftInputShown}
    onSoftInputHidden={onSoftInputHidden}
    enabled>
    <TextInput
      ref={chatInputRef}
      style={styles.chatInput}
      placeholder="Type a message..."
      value={messageText}
      onChangeText={setMessageText}
      multiline
      blurOnSubmit={false}
      placeholderTextColor={colors.text.secondary}
      editable={true}
      onTouchStart={onInputTouchStart}
      onFocus={onInputFocus}
      onBlur={onInputBlur}
    />
    <TouchableOpacity
      style={styles.sendButton}
      onPressIn={onSendPress}
      disabled={!messageText.trim()}>
      <Icon
        name="send"
        size={20}
        color={messageText.trim() ? colors.primary : colors.text.light}
      />
    </TouchableOpacity>
    </AvoidSoftInputView>
  );
};

export default ChatComposer;
