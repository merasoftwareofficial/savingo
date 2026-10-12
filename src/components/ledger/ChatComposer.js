import React, {useCallback, useState} from 'react';
import {findNodeHandle, requireNativeComponent, TextInput} from 'react-native';
import {AvoidSoftInputView} from 'react-native-avoid-softinput';
import ioniconsGlyphs from 'react-native-vector-icons/glyphmaps/Ionicons.json';
import {spacing} from '../../utils/theme';
import {useTheme} from '../../context/ThemeContext';

const NativeChatSendButton = requireNativeComponent('ChatSendButton');
const sendGlyph = String.fromCodePoint(ioniconsGlyphs.send);

const ChatComposer = ({
  styles,
  insetsBottom,
  chatInputRef,
  draftRef,
  sendAllowed,
  ownerId,
  receiverId,
  conversationId,
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
  const [inputTag, setInputTag] = useState(null);
  const bindInputRef = useCallback(input => {
    chatInputRef.current = input;
    if (input) {
      setInputTag(findNodeHandle(input));
    }
  }, [chatInputRef]);
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
      ref={bindInputRef}
      style={styles.chatInput}
      placeholder="Type a message..."
      defaultValue=""
      onChangeText={text => {
        draftRef.current = text;
      }}
      multiline
      blurOnSubmit={false}
      placeholderTextColor={colors.text.secondary}
      editable={true}
      onTouchStart={onInputTouchStart}
      onFocus={onInputFocus}
      onBlur={onInputBlur}
    />
    <NativeChatSendButton
      style={styles.sendButton}
      inputTag={inputTag || 0}
      sendAllowed={sendAllowed}
      ownerId={ownerId || ''}
      receiverId={receiverId || ''}
      conversationId={conversationId || ''}
      glyph={sendGlyph}
      activeColor={colors.primary}
      inactiveColor={colors.text.light}
      onDraftSend={event => onSendPress(event.nativeEvent)}
    />
    </AvoidSoftInputView>
  );
};

export default ChatComposer;
