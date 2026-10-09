import React, {useState, useEffect, useCallback, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Image,
} from 'react-native';
import {GiftedChat, Bubble, Send, InputToolbar, Composer} from 'react-native-gifted-chat';
import Icon from 'react-native-vector-icons/Ionicons';
import auth from '@react-native-firebase/auth';
import {colors, fontSize} from '../utils/theme';
import {
  getMessages,
  insertMessage,
  updateConversation,
  markConversationAsRead,
} from '../services/chatDatabase';
import {sendMessageToUser, subscribeToIncomingMessages} from '../services/messagingService';

const ChatConversationScreen = ({route, navigation}) => {
  const {
    conversationId,
    otherUserId,
    otherUserName,
    otherUserUsername,
    otherUserPhoto,
  } = route.params;

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const currentUser = auth().currentUser;
  const isMountedRef = useRef(true);

  const loadMessages = useCallback(() => {
    try {
      const dbMessages = getMessages(conversationId);

      // Convert to Gifted Chat format
      const formattedMessages = dbMessages.map(msg => ({
        _id: msg.message_id,
        text: msg.message_text,
        createdAt: new Date(msg.timestamp),
        user: {
          _id: msg.sender_id,
          name: msg.sender_id === currentUser?.uid ? 'You' : otherUserName,
          avatar: msg.sender_id === currentUser?.uid ? currentUser?.photoURL : otherUserPhoto,
        },
        sent: msg.delivery_status === 'sent' || msg.delivery_status === 'delivered',
        received: msg.delivery_status === 'delivered' || msg.delivery_status === 'read',
        pending: msg.delivery_status === 'sending' || msg.delivery_status === 'pending',
      }));

      setMessages(formattedMessages);
    } catch (error) {
      console.error('Error loading messages:', error);
    } finally {
      setLoading(false);
    }
  }, [conversationId, currentUser?.uid, currentUser?.photoURL, otherUserName, otherUserPhoto]);

  useEffect(() => {
    loadMessages();
    markConversationAsRead(conversationId);
  }, [conversationId, loadMessages]);

  useEffect(() => {
    const unsubscribe = subscribeToIncomingMessages((data) => {
      if (data?.type === 'chat_message' && data.conversationId === conversationId) {
        loadMessages();
      }
      if (
        (data?.type === 'delivery_receipt' || data?.type === 'read_receipt' || data?.type === 'message_status_update') &&
        (!data.conversationId || data.conversationId === conversationId)
      ) {
        loadMessages();
      }
    });
    return unsubscribe;
  }, [conversationId, loadMessages]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const onSend = useCallback(async (newMessages = []) => {
    const message = newMessages[0];
    if (!message) {
      return;
    }

    const now = Date.now();
    const tempId = `local_${now}_${Math.random().toString(36).substr(2, 6)}`;

    const optimistic = {
      _id: tempId,
      text: message.text,
      createdAt: new Date(now),
      user: {
        _id: currentUser?.uid,
        name: currentUser?.displayName || 'You',
        avatar: currentUser?.photoURL,
      },
      sent: false,
      received: false,
      pending: true,
    };

    setMessages(prev => GiftedChat.append(prev, [optimistic]));

    try {
      const messageData = {
        conversationId,
        messageId: tempId,
        messageText: message.text,
        messageType: 'text',
        timestamp: now,
      };

      // Send message (saves locally + sends via backend)
      await sendMessageToUser(otherUserId, messageData);

      // Reload messages to show updated status
      if (isMountedRef.current) {
        loadMessages();
      }
    } catch (error) {
      console.error('Error sending message:', error);
      // Keep optimistic message; DB already has queued status if needed
      if (isMountedRef.current) {
        loadMessages();
      }
    }
  }, [conversationId, otherUserId, currentUser]);

  const renderBubble = (props) => {
    return (
      <Bubble
        {...props}
        wrapperStyle={{
          right: {
            backgroundColor: colors.primary,
          },
          left: {
            backgroundColor: colors.inputBg,
          },
        }}
        textStyle={{
          right: {
            color: '#fff',
          },
          left: {
            color: colors.text,
          },
        }}
      />
    );
  };

  const renderSend = (props) => {
    const canSend = Boolean(props?.text?.trim());
    return (
      <Send {...props}>
        <View style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}>
          <Icon
            name="send"
            size={20}
            color={canSend ? colors.primary : colors.text.light}
          />
        </View>
      </Send>
    );
  };

  const renderComposer = props => (
    <Composer
      {...props}
      textInputStyle={styles.chatInputText}
      placeholderTextColor={colors.text.secondary}
    />
  );

  const renderInputToolbar = (props) => {
    return (
      <InputToolbar
        {...props}
        containerStyle={styles.inputToolbar}
        primaryStyle={styles.inputPrimary}
      />
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          {otherUserPhoto ? (
            <Image source={{uri: otherUserPhoto}} style={styles.headerAvatar} />
          ) : (
            <View style={styles.headerAvatarPlaceholder}>
              <Text style={styles.headerAvatarText}>
                {otherUserName?.charAt(0)?.toUpperCase() || '?'}
              </Text>
            </View>
          )}
          <View style={styles.headerText}>
            <Text style={styles.headerName}>{otherUserName}</Text>
            {otherUserUsername && (
              <Text style={styles.headerUsername}>@{otherUserUsername}</Text>
            )}
          </View>
        </View>
        <TouchableOpacity onPress={() => {
          // Show menu options
          console.log('Show menu');
        }}>
          <Icon name="ellipsis-vertical" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      <GiftedChat
        messages={messages}
        onSend={messages => onSend(messages)}
        user={{
          _id: currentUser?.uid,
          name: currentUser?.displayName,
          avatar: currentUser?.photoURL,
        }}
        renderBubble={renderBubble}
        renderSend={renderSend}
        renderComposer={renderComposer}
        renderInputToolbar={renderInputToolbar}
        placeholder="Type a message..."
        alwaysShowSend
        scrollToBottom
        renderAvatarOnTop
        showUserAvatar
        renderUsernameOnMessage
        isLoadingEarlier={loading}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: '#fff',
  },
  headerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  headerAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerAvatarText: {
    fontSize: fontSize.medium,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerText: {
    marginLeft: 12,
    flex: 1,
  },
  headerName: {
    fontSize: fontSize.medium,
    fontWeight: '600',
    color: colors.text,
  },
  headerUsername: {
    fontSize: fontSize.small,
    color: colors.textSecondary,
  },
  sendButton: {
    marginRight: 10,
    marginBottom: 8,
    justifyContent: 'center',
    alignItems: 'center',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E3F2FD',
  },
  sendButtonDisabled: {
    opacity: 0.7,
  },
  inputToolbar: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
  },
  inputPrimary: {
    alignItems: 'flex-end',
  },
  chatInputText: {
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 0,
    fontSize: fontSize.medium,
    color: colors.text.primary,
    lineHeight: 20,
  },
});

export default ChatConversationScreen;
