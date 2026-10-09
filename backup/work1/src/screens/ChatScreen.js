import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {colors, fontSize} from '../utils/theme';

const ChatScreen = ({navigation}) => {
  // Placeholder - will implement full functionality later
  const conversations = [];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chat</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate('UserSearch')}>
          <Icon name="add-circle" size={28} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {conversations.length === 0 ? (
        <View style={styles.emptyState}>
          <Icon name="chatbubbles-outline" size={64} color={colors.textSecondary} />
          <Text style={styles.emptyTitle}>No conversations yet</Text>
          <Text style={styles.emptyText}>
            Tap the + button to start a new chat
          </Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={item => item.conversation_id}
          renderItem={({item}) => (
            <TouchableOpacity style={styles.conversationItem}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {item.other_user_name?.charAt(0) || '?'}
                </Text>
              </View>
              <View style={styles.conversationContent}>
                <View style={styles.conversationHeader}>
                  <Text style={styles.userName}>{item.other_user_name}</Text>
                  <Text style={styles.timestamp}>
                    {/* Will format timestamp */}
                  </Text>
                </View>
                <Text style={styles.lastMessage} numberOfLines={1}>
                  {item.last_message_text}
                </Text>
              </View>
              {item.unread_count > 0 && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadText}>{item.unread_count}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        />
      )}
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
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: fontSize.large,
    fontWeight: 'bold',
    color: colors.text,
  },
  addButton: {
    padding: 4,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: fontSize.medium,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: fontSize.small,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  conversationItem: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems: 'center',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: fontSize.large,
    fontWeight: 'bold',
    color: '#fff',
  },
  conversationContent: {
    flex: 1,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  userName: {
    fontSize: fontSize.medium,
    fontWeight: '600',
    color: colors.text,
  },
  timestamp: {
    fontSize: fontSize.small,
    color: colors.textSecondary,
  },
  lastMessage: {
    fontSize: fontSize.small,
    color: colors.textSecondary,
  },
  unreadBadge: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  unreadText: {
    color: '#fff',
    fontSize: fontSize.small,
    fontWeight: 'bold',
  },
});

export default ChatScreen;
