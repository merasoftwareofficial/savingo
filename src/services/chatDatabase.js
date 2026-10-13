import {open} from 'react-native-quick-sqlite';

const DB_NAME = 'chatDB.db';

let db = null;

const openChatDatabase = () => open({name: DB_NAME});

const resetClosedChatHandle = () => {
  if (!db) {
    return;
  }
  try {
    db.close?.();
  } catch {
    // Ignore close errors while recovering a stale handle.
  } finally {
    db = null;
  }
};

// Get or create database connection
const getDB = () => {
  if (db) {
    try {
      db.execute('SELECT 1');
      return db;
    } catch (error) {
      console.warn('Chat database handle became stale, reopening:', error);
      resetClosedChatHandle();
    }
  }
  db = openChatDatabase();
  return db;
};

export const resetChatDatabaseConnection = () => {
  try {
    resetClosedChatHandle();
  } catch (error) {
    console.warn('Failed to close chat database handle:', error);
  }
};

/**
 * Initialize chat database with required tables
 */
export const initChatDatabase = () => {
  const database = getDB();

  // Create conversations table
  database.execute(`
    CREATE TABLE IF NOT EXISTS conversations (
      conversation_id TEXT PRIMARY KEY,
      other_user_id TEXT NOT NULL,
      other_user_username TEXT,
      other_user_name TEXT,
      other_user_phone TEXT,
      other_user_photo TEXT,
      last_message_text TEXT,
      last_message_timestamp INTEGER,
      unread_count INTEGER DEFAULT 0,
      is_pinned INTEGER DEFAULT 0,
      is_muted INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Create messages table
  database.execute(`
    CREATE TABLE IF NOT EXISTS messages (
      message_id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      receiver_id TEXT NOT NULL,
      message_text TEXT,
      message_type TEXT DEFAULT 'text',
      image_uri TEXT,
      transaction_request_data TEXT,
      delivery_status TEXT DEFAULT 'pending',
      is_read INTEGER DEFAULT 0,
      is_deleted INTEGER DEFAULT 0,
      deleted_at INTEGER,
      edit_history TEXT,
      timestamp INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations (conversation_id)
    )
  `);

  // Create user cache table
  database.execute(`
    CREATE TABLE IF NOT EXISTS user_cache (
      user_id TEXT PRIMARY KEY,
      username TEXT,
      display_name TEXT,
      phone_number TEXT,
      photo_url TEXT,
      is_online INTEGER DEFAULT 0,
      last_seen INTEGER,
      cached_at INTEGER
    )
  `);

  // Create message queue table for offline support
  database.execute(`
    CREATE TABLE IF NOT EXISTS message_queue (
      queue_id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      receiver_id TEXT NOT NULL,
      message_data TEXT NOT NULL,
      retry_count INTEGER DEFAULT 0,
      last_retry_at INTEGER,
      next_retry_at INTEGER,
      created_at INTEGER NOT NULL
    )
  `);

  database.execute(`
    CREATE TABLE IF NOT EXISTS receipt_queue (
      owner_uid TEXT NOT NULL,
      message_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('delivered', 'read')),
      retry_count INTEGER NOT NULL DEFAULT 0,
      next_retry_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (owner_uid, message_id)
    )
  `);

  // Legacy DB migration: add next_retry_at if table already exists without it.
  try {
    database.execute('ALTER TABLE message_queue ADD COLUMN next_retry_at INTEGER');
  } catch (error) {
    // Ignore duplicate-column errors to keep init idempotent.
  }

  // Performance indexes for fast timeline fetch and cleanup.
  database.execute(`
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_time
    ON messages(conversation_id, timestamp DESC)
  `);
  database.execute(`
    CREATE INDEX IF NOT EXISTS idx_conversations_other_user
    ON conversations(other_user_id)
  `);

  console.log('Chat database initialized successfully');
};

/**
 * Create or get existing conversation
 */
export const createConversation = (otherUserId, userData, currentUserId) => {
  const database = getDB();
  const resolvedUserId = currentUserId || global.currentUserId;
  if (!resolvedUserId) {
    throw new Error('Current user ID not available');
  }

  // Create conversation ID (sorted to ensure consistency)
  const conversationId = [resolvedUserId, otherUserId].sort().join('_');

  const now = Date.now();

  database.execute(
    `INSERT OR REPLACE INTO conversations
     (conversation_id, other_user_id, other_user_username, other_user_name,
      other_user_phone, other_user_photo, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      conversationId,
      otherUserId,
      userData.username || '',
      userData.displayName || '',
      userData.phoneNumber || '',
      userData.photoURL || '',
      now,
      now,
    ]
  );

  return conversationId;
};

/**
 * Get all conversations, sorted by last message timestamp
 */
export const getConversations = () => {
  const database = getDB();

  const result = database.execute(`
    SELECT * FROM conversations
    ORDER BY is_pinned DESC, last_message_timestamp DESC
  `);

  return result.rows?._array || [];
};

/**
 * Get conversation by ID
 */
export const getConversation = (conversationId) => {
  const database = getDB();

  const result = database.execute(
    'SELECT * FROM conversations WHERE conversation_id = ?',
    [conversationId]
  );

  return result.rows?._array?.[0] || null;
};

/**
 * Update conversation metadata
 */
export const updateConversation = (conversationId, updates) => {
  const database = getDB();
  const now = Date.now();

  const fields = [];
  const values = [];

  if (updates.lastMessageText !== undefined) {
    fields.push('last_message_text = ?');
    values.push(updates.lastMessageText);
  }

  if (updates.lastMessageTimestamp !== undefined) {
    fields.push('last_message_timestamp = ?');
    values.push(updates.lastMessageTimestamp);
  }

  if (updates.unreadCount === 'INCREMENT') {
    fields.push('unread_count = unread_count + 1');
  } else if (updates.unreadCount !== undefined) {
    fields.push('unread_count = ?');
    values.push(updates.unreadCount);
  }

  if (updates.isPinned !== undefined) {
    fields.push('is_pinned = ?');
    values.push(updates.isPinned ? 1 : 0);
  }

  if (updates.isMuted !== undefined) {
    fields.push('is_muted = ?');
    values.push(updates.isMuted ? 1 : 0);
  }

  fields.push('updated_at = ?');
  values.push(now);

  values.push(conversationId);

  database.execute(
    `UPDATE conversations SET ${fields.join(', ')} WHERE conversation_id = ?`,
    values
  );
};

/**
 * Insert a new message
 */
export const insertMessage = (messageData) => {
  const database = getDB();
  const now = Date.now();

  const messageId = messageData.messageId || `msg_${now}_${Math.random().toString(36).substr(2, 9)}`;

  database.execute(
    `INSERT INTO messages
     (message_id, conversation_id, sender_id, receiver_id, message_text,
      message_type, image_uri, transaction_request_data, delivery_status,
      is_read, timestamp, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      messageId,
      messageData.conversationId,
      messageData.senderId,
      messageData.receiverId,
      messageData.messageText || '',
      messageData.messageType || 'text',
      messageData.imageUri || null,
      messageData.transactionRequestData || null,
      messageData.deliveryStatus || 'pending',
      messageData.isRead ? 1 : 0,
      messageData.timestamp || now,
      now,
    ]
  );

  return messageId;
};


/**
 * Get message by ID
 */
export const getMessageById = (messageId) => {
  const database = getDB();
  const result = database.execute(
    'SELECT * FROM messages WHERE message_id = ? LIMIT 1',
    [messageId]
  );
  return result.rows?._array?.[0] || null;
};

/**
 * Get messages for a conversation with optional pagination.
 * Pass a finite positive limit to page; omit it to load full local history.
 */
export const getMessages = (conversationId, limit = null, offset = 0) => {
  const database = getDB();
  const safeOffset = Math.max(0, Number(offset) || 0);
  const safeLimit = Number(limit);

  const result = Number.isFinite(safeLimit) && safeLimit > 0
    ? database.execute(
        `SELECT * FROM messages
         WHERE conversation_id = ? AND is_deleted = 0
         ORDER BY timestamp DESC
         LIMIT ? OFFSET ?`,
        [conversationId, Math.floor(safeLimit), safeOffset]
      )
    : database.execute(
        `SELECT * FROM messages
         WHERE conversation_id = ? AND is_deleted = 0
         ORDER BY timestamp DESC`,
        [conversationId]
      );

  return result.rows?._array || [];
};

export const getMessagesPage = (conversationId, limit = 50, before = null) => {
  const database = getDB();
  const size = Math.max(1, Math.floor(Number(limit) || 50));
  const cursorSql = before ? " AND (timestamp < ? OR (timestamp = ? AND ('msg-' || message_id) < ?))" : '';
  const parameters = [conversationId];
  if (before) parameters.push(before.timestamp, before.timestamp, before.id);
  parameters.push(size);
  return database.execute(`SELECT * FROM messages WHERE conversation_id = ? AND is_deleted = 0
    ${cursorSql} ORDER BY timestamp DESC, message_id DESC LIMIT ?`, parameters).rows?._array || [];
};

/**
 * Update message status (pending → sending → sent → delivered → read)
 */
export const updateMessageStatus = (messageId, status) => {
  const database = getDB();
  const ranks = {pending: 0, sending: 0, queued: 0, failed: 0, accepted: 1, pushed: 1, sent: 1, delivered: 2, read: 3};
  if (!Object.prototype.hasOwnProperty.call(ranks, status)) {
    return;
  }
  database.execute(
    `UPDATE messages SET delivery_status = ? WHERE message_id = ?
     AND CASE delivery_status
       WHEN 'read' THEN 3 WHEN 'delivered' THEN 2
       WHEN 'sent' THEN 1 WHEN 'accepted' THEN 1 WHEN 'pushed' THEN 1
       ELSE 0 END <= ?`,
    [status, messageId, ranks[status]]
  );
};

// Persist the message and its retry obligation together, before network I/O.
export const saveOutgoingMessage = (message, payload) => {
  const database = getDB();
  database.execute('BEGIN IMMEDIATE TRANSACTION');
  try {
    insertMessage(message);
    queueMessage(message.messageId, message.receiverId, {
      ...payload,
      messageId: message.messageId,
      senderId: message.senderId,
      timestamp: message.timestamp,
    });
    updateConversation(message.conversationId, {
      lastMessageText: message.messageText,
      lastMessageTimestamp: message.timestamp,
    });
    database.execute('COMMIT');
  } catch (error) {
    database.execute('ROLLBACK');
    throw error;
  }
};

export const requeueOutgoingMessage = (messageId, receiverId, payload) => {
  const database = getDB();
  database.execute('BEGIN IMMEDIATE TRANSACTION');
  try {
    queueMessage(messageId, receiverId, payload);
    updateMessageStatus(messageId, 'sending');
    database.execute('COMMIT');
  } catch (error) {
    database.execute('ROLLBACK');
    throw error;
  }
};

export const saveIncomingMessage = (message, policy) => {
  const database = getDB();
  database.execute('BEGIN IMMEDIATE TRANSACTION');
  try {
    insertMessage(message);
    queueDeliveryReceipt(message.receiverId, message.senderId, message.messageId, policy.receiptStatus);
    updateConversation(message.conversationId, {
      lastMessageText: message.messageText,
      lastMessageTimestamp: message.timestamp,
      unreadCount: policy.incrementUnread ? 'INCREMENT' : 0,
    });
    database.execute('COMMIT');
  } catch (error) {
    database.execute('ROLLBACK');
    throw error;
  }
};

export const hasQueuedDeliveryWork = ownerUid => Boolean(
  getDB().execute(
    `SELECT 1 FROM message_queue q JOIN messages m ON m.message_id = q.message_id
     WHERE m.sender_id = ?
     UNION ALL SELECT 1 FROM receipt_queue WHERE owner_uid = ? LIMIT 1`,
    [ownerUid, ownerUid],
  ).rows?._array?.length,
);

export const queueDeliveryReceipt = (ownerUid, senderId, messageId, status) => {
  if (!ownerUid || !senderId || !messageId || !['delivered', 'read'].includes(status)) {
    throw new Error('Invalid delivery receipt');
  }
  getDB().execute(
    `INSERT INTO receipt_queue (owner_uid, message_id, sender_id, status)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(owner_uid, message_id) DO UPDATE SET
       next_retry_at = CASE WHEN receipt_queue.status <> 'read' AND excluded.status = 'read'
         THEN 0 ELSE receipt_queue.next_retry_at END,
       retry_count = CASE WHEN receipt_queue.status <> 'read' AND excluded.status = 'read'
         THEN 0 ELSE receipt_queue.retry_count END,
       status = CASE WHEN receipt_queue.status = 'read' THEN 'read' ELSE excluded.status END`,
    [ownerUid, messageId, senderId, status],
  );
};

export const getPendingReceipts = ownerUid =>
  getDB().execute(
    'SELECT * FROM receipt_queue WHERE owner_uid = ? AND next_retry_at <= ? LIMIT 100',
    [ownerUid, Date.now()],
  ).rows?._array || [];

// messages is keyed by message_id; its implicit rowid is the stable page cursor.
export const getMessagesAwaitingRead = (ownerUid, afterId = 0) =>
  getDB().execute(
    `SELECT rowid AS id, message_id, conversation_id FROM messages
     WHERE sender_id = ? AND delivery_status <> 'read' AND rowid > ?
     ORDER BY rowid LIMIT 100`, [ownerUid, afterId],
  ).rows?._array || [];

export const completeDeliveryReceipt = receipt => {
  // A delivered response must not delete a read receipt queued during the request.
  getDB().execute(
    'DELETE FROM receipt_queue WHERE owner_uid = ? AND message_id = ? AND status = ?',
    [receipt.owner_uid, receipt.message_id, receipt.status],
  );
};

export const deferDeliveryReceipt = (receipt, delayMs) => {
  getDB().execute(
    `UPDATE receipt_queue SET retry_count = retry_count + 1, next_retry_at = ?
     WHERE owner_uid = ? AND message_id = ? AND status = ?`,
    [Date.now() + delayMs, receipt.owner_uid, receipt.message_id, receipt.status],
  );
};

export const markConversationReadWithReceipts = (conversationId, ownerUid) => {
  const database = getDB();
  database.execute('BEGIN IMMEDIATE TRANSACTION');
  try {
    // No receipt-limit: every unread incoming row creates a durable obligation.
    const rows = database.execute(
      `SELECT message_id, sender_id FROM messages
       WHERE conversation_id = ? AND receiver_id = ? AND is_read = 0`,
      [conversationId, ownerUid],
    ).rows?._array || [];
    rows.forEach(row => queueDeliveryReceipt(ownerUid, row.sender_id, row.message_id, 'read'));
    markConversationAsRead(conversationId);
    database.execute('COMMIT');
    return rows;
  } catch (error) {
    database.execute('ROLLBACK');
    throw error;
  }
};

/**
 * Update message (for editing)
 */
export const updateMessage = (messageId, updates) => {
  const database = getDB();

  const fields = [];
  const values = [];

  if (updates.messageText !== undefined) {
    // Save edit history
    const result = database.execute(
      'SELECT message_text, edit_history FROM messages WHERE message_id = ?',
      [messageId]
    );

    if (result.rows?._array?.length > 0) {
      const oldMessage = result.rows._array[0];
      const editHistory = oldMessage.edit_history
        ? JSON.parse(oldMessage.edit_history)
        : [];

      editHistory.push({
        text: oldMessage.message_text,
        editedAt: Date.now(),
      });

      fields.push('edit_history = ?');
      values.push(JSON.stringify(editHistory));
    }

    fields.push('message_text = ?');
    values.push(updates.messageText);
  }

  if (updates.transactionRequestData !== undefined) {
    fields.push('transaction_request_data = ?');
    values.push(updates.transactionRequestData);
  }

  if (updates.isRead !== undefined) {
    fields.push('is_read = ?');
    values.push(updates.isRead ? 1 : 0);
  }

  values.push(messageId);

  if (fields.length > 0) {
    database.execute(
      `UPDATE messages SET ${fields.join(', ')} WHERE message_id = ?`,
      values
    );
  }
};

/**
 * Soft delete a message
 */
export const deleteMessage = (messageId) => {
  const database = getDB();
  const now = Date.now();

  database.execute(
    'UPDATE messages SET is_deleted = 1, deleted_at = ? WHERE message_id = ?',
    [now, messageId]
  );
};

/**
 * Hard delete multiple messages by ids.
 */
export const deleteMessagesHard = (messageIds = []) => {
  const ids = Array.from(
    new Set(
      (Array.isArray(messageIds) ? messageIds : [])
        .map(item => String(item || '').trim())
        .filter(Boolean)
    )
  );
  if (!ids.length) {
    return {deletedCount: 0};
  }

  const database = getDB();
  const placeholders = ids.map(() => '?').join(', ');

  database.execute(
    `DELETE FROM messages WHERE message_id IN (${placeholders})`,
    ids
  );
  database.execute(
    `DELETE FROM message_queue WHERE message_id IN (${placeholders})`,
    ids
  );

  return {deletedCount: ids.length};
};

/**
 * Get latest non-deleted message for a conversation.
 */
export const getLatestConversationMessage = (conversationId) => {
  const convId = String(conversationId || '').trim();
  if (!convId) {
    return null;
  }
  const database = getDB();
  const result = database.execute(
    `SELECT message_id, message_text, timestamp
     FROM messages
     WHERE conversation_id = ? AND is_deleted = 0
     ORDER BY timestamp DESC
     LIMIT 1`,
    [convId]
  );
  return result.rows?._array?.[0] || null;
};

/**
 * Get latest message per user (batch) — keyed by other_user_id
 * Returns: { userId: { text, timestamp } }
 */
export const getLatestMessagePerUser = () => {
  try {
    const database = getDB();
    const result = database.execute(
      `SELECT c.other_user_id, m.message_text as text, m.timestamp, m.sender_id, m.delivery_status
       FROM conversations c
       INNER JOIN messages m ON c.conversation_id = m.conversation_id
       WHERE m.is_deleted = 0
       AND m.timestamp = (
         SELECT MAX(m2.timestamp) FROM messages m2
         WHERE m2.conversation_id = c.conversation_id AND m2.is_deleted = 0
       )`
    );
    const map = {};
    (result.rows?._array || []).forEach(row => {
      if (row.other_user_id && row.text) {
        const existing = map[row.other_user_id];
        if (!existing || row.timestamp > existing.timestamp) {
          map[row.other_user_id] = {
            text: row.text,
            timestamp: row.timestamp || 0,
            // Outgoing when the sender is not the peer; the list shows its status like the chat bubble.
            isOutgoing: Boolean(row.sender_id) && row.sender_id !== row.other_user_id,
            deliveryStatus: row.delivery_status || '',
          };
        }
      }
    });
    return map;
  } catch (_) {
    return {};
  }
};

/**
 * Cache user data locally
 */
export const cacheUserData = (userData) => {
  const database = getDB();
  const now = Date.now();

  database.execute(
    `INSERT OR REPLACE INTO user_cache
     (user_id, username, display_name, phone_number, photo_url,
      is_online, last_seen, cached_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userData.userId,
      userData.username || '',
      userData.displayName || '',
      userData.phoneNumber || '',
      userData.photoURL || '',
      userData.isOnline ? 1 : 0,
      userData.lastOnline || now,
      now,
    ]
  );
};

/**
 * Get cached user data
 */
export const getCachedUser = (userId) => {
  const database = getDB();

  const result = database.execute(
    'SELECT * FROM user_cache WHERE user_id = ?',
    [userId]
  );

  return result.rows?._array?.[0] || null;
};

/**
 * Queue message for retry when offline
 */
export const queueMessage = (messageId, receiverId, messageData) => {
  const database = getDB();
  const now = Date.now();

  database.execute(
    `INSERT INTO message_queue
     (message_id, conversation_id, receiver_id, message_data, retry_count, last_retry_at, next_retry_at, created_at)
     SELECT ?, ?, ?, ?, 0, ?, ?, ?
     WHERE NOT EXISTS (SELECT 1 FROM message_queue WHERE message_id = ?)`,
    [
      messageId,
      messageData.conversationId,
      receiverId,
      JSON.stringify(messageData),
      0,
      now,
      now,
      messageId,
    ]
  );
};

/**
 * Get pending messages for retry
 */
export const getPendingMessages = ownerUid => {
  const database = getDB();
  const now = Date.now();

  const result = database.execute(
    `SELECT *
     FROM message_queue
     WHERE message_id IN (SELECT message_id FROM messages WHERE sender_id = ?)
       AND queue_id IN (SELECT MIN(queue_id) FROM message_queue GROUP BY message_id)
       AND (next_retry_at IS NULL OR next_retry_at <= ?)
     ORDER BY created_at ASC LIMIT 100`,
    [ownerUid || '', now]
  );

  return result.rows?._array || [];
};

/**
 * Remove message from queue after successful send
 */
export const removeFromQueue = (queueId) => {
  const database = getDB();

  database.execute('DELETE FROM message_queue WHERE queue_id = ?', [queueId]);
};

export const removeMessageFromQueue = messageId => {
  getDB().execute('DELETE FROM message_queue WHERE message_id = ?', [messageId]);
};

export const recoverOutgoingQueue = ownerUid => {
  const rows = getDB().execute(
    `SELECT * FROM messages WHERE sender_id = ?
     AND delivery_status IN ('pending', 'sending', 'queued')
     AND message_id NOT IN (SELECT message_id FROM message_queue)`,
    [ownerUid],
  ).rows?._array || [];
  rows.forEach(row => queueMessage(row.message_id, row.receiver_id, {
    messageId: row.message_id, conversationId: row.conversation_id,
    senderId: row.sender_id, receiverId: row.receiver_id,
    messageText: row.message_text, messageType: row.message_type,
    imageUri: row.image_uri, transactionRequestData: row.transaction_request_data,
    timestamp: row.timestamp,
  }));
};

/**
 * Increment retry count for a queued message
 */
export const incrementRetryCount = (queueId, options = {}) => {
  const database = getDB();
  const now = Date.now();
  const delayMs = Math.max(5_000, Number(options?.delayMs) || 30_000);
  const nextRetryAt = now + delayMs;

  database.execute(
    'UPDATE message_queue SET retry_count = retry_count + 1, last_retry_at = ?, next_retry_at = ? WHERE queue_id = ?',
    [now, nextRetryAt, queueId]
  );
};

export const postponeQueuedMessage = (queueId, delayMs = 120_000) => {
  const database = getDB();
  const now = Date.now();
  const nextRetryAt = now + Math.max(5_000, Number(delayMs) || 120_000);
  database.execute(
    'UPDATE message_queue SET last_retry_at = ?, next_retry_at = ? WHERE queue_id = ?',
    [now, nextRetryAt, queueId]
  );
};

export const updateQueuedMessageTarget = (queueId, receiverId, messageData) => {
  const database = getDB();
  const now = Date.now();
  database.execute(
    'UPDATE message_queue SET receiver_id = ?, message_data = ?, last_retry_at = ?, next_retry_at = ? WHERE queue_id = ?',
    [String(receiverId || ''), JSON.stringify(messageData || {}), now, now, queueId]
  );
};

/**
 * Mark all messages in a conversation as read
 */
export const markConversationAsRead = (conversationId) => {
  const database = getDB();

  database.execute(
    'UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND is_read = 0',
    [conversationId]
  );

  database.execute(
    'UPDATE conversations SET unread_count = 0 WHERE conversation_id = ?',
    [conversationId]
  );
};

/**
 * Get unread count for a conversation
 */
export const getUnreadCount = (conversationId) => {
  const database = getDB();

  const result = database.execute(
    'SELECT unread_count FROM conversations WHERE conversation_id = ?',
    [conversationId]
  );

  return result.rows?._array?.[0]?.unread_count || 0;
};

export const getUnreadCountForOtherUserId = otherUserId => {
  const database = getDB();
  const peerId = String(otherUserId || '').trim();
  if (!peerId) {
    return 0;
  }

  const result = database.execute(
    `SELECT COALESCE(SUM(unread_count), 0) AS unread_total
     FROM conversations
     WHERE other_user_id = ?`,
    [peerId]
  );

  return result.rows?._array?.[0]?.unread_total || 0;
};

/**
 * Get unread incoming messages for read-receipt updates.
 */
export const getUnreadIncomingMessages = (conversationId, selfUserId, limit = 50) => {
  const database = getDB();
  const convId = String(conversationId || '').trim();
  const selfId = String(selfUserId || '').trim();
  if (!convId || !selfId) {
    return [];
  }

  const resolvedLimit = Math.max(1, Math.min(200, Number(limit) || 50));
  const result = database.execute(
    `SELECT message_id, sender_id, timestamp
     FROM messages
     WHERE conversation_id = ?
       AND is_read = 0
       AND sender_id != ?
     ORDER BY timestamp DESC
     LIMIT ?`,
    [convId, selfId, resolvedLimit]
  );

  return result.rows?._array || [];
};

/**
 * Search conversations locally
 */
export const searchConversations = (query) => {
  const database = getDB();

  const searchTerm = `%${query}%`;

  const result = database.execute(
    `SELECT * FROM conversations
     WHERE other_user_name LIKE ?
        OR other_user_username LIKE ?
        OR last_message_text LIKE ?
     ORDER BY last_message_timestamp DESC`,
    [searchTerm, searchTerm, searchTerm]
  );

  return result.rows?._array || [];
};

/**
 * Clear all chat data (for logout/reset)
 */
export const clearChatData = () => {
  const database = getDB();

  database.execute('DELETE FROM conversations');
  database.execute('DELETE FROM messages');
  database.execute('DELETE FROM user_cache');
  database.execute('DELETE FROM message_queue');
  database.execute('DELETE FROM receipt_queue');

  console.log('Chat data cleared');
};

/**
 * Delete all messages and conversation metadata for a single conversation.
 */
export const deleteConversationCascade = (conversationId) => {
  if (!conversationId) {
    return {success: false, deletedConversationId: null};
  }
  const database = getDB();
  const convId = String(conversationId);

  database.execute('DELETE FROM message_queue WHERE conversation_id = ?', [convId]);
  database.execute('DELETE FROM messages WHERE conversation_id = ?', [convId]);
  database.execute('DELETE FROM conversations WHERE conversation_id = ?', [convId]);

  return {success: true, deletedConversationId: convId};
};

/**
 * Delete all conversation threads for a specific peer user id.
 */
export const deleteConversationsByOtherUserId = (otherUserId) => {
  const peerId = String(otherUserId || '').trim();
  if (!peerId) {
    return {success: true, deletedConversations: []};
  }

  const database = getDB();
  const result = database.execute(
    'SELECT conversation_id FROM conversations WHERE other_user_id = ?',
    [peerId]
  );
  const rows = result.rows?._array || [];
  const conversationIds = rows.map(row => String(row.conversation_id || '')).filter(Boolean);

  conversationIds.forEach(conversationId => {
    deleteConversationCascade(conversationId);
  });

  return {success: true, deletedConversations: conversationIds};
};

export default {
  initChatDatabase,
  getDB,
  resetChatDatabaseConnection,
  createConversation,
  getConversations,
  getConversation,
  updateConversation,
  insertMessage,
  getMessages,
  getMessageById,
  updateMessageStatus,
  updateMessage,
  deleteMessage,
  deleteMessagesHard,
  getLatestConversationMessage,
  cacheUserData,
  getCachedUser,
  queueMessage,
  getPendingMessages,
  removeFromQueue,
  incrementRetryCount,
  postponeQueuedMessage,
  updateQueuedMessageTarget,
  markConversationAsRead,
  getUnreadCount,
  getUnreadCountForOtherUserId,
  getUnreadIncomingMessages,
  searchConversations,
  clearChatData,
  deleteConversationCascade,
  deleteConversationsByOtherUserId,
};
