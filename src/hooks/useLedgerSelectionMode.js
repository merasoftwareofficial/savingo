import {useCallback, useMemo, useState} from 'react';
import Clipboard from '@react-native-clipboard/clipboard';
import {showAppAlert} from '../context/AppAlertBridge';
import {cancelComposerSend} from '../services/chatComposerHandoff';

const useLedgerSelectionMode = ({
  timelineForList,
  currentUserId,
  getContactFirstName,
  formatTimeLabel,
  showToast,
  setLoading,
  deleteMessagesHard,
  conversationId,
  getLatestConversationMessage,
  updateConversation,
  loadUnifiedTimeline,
  onMessagesDeleted,
}) => {
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState({});
  const timelineItems = useMemo(() => Array.isArray(timelineForList) ? timelineForList : [], [timelineForList]);

  const selectedCount = useMemo(
    () => Object.keys(selectedMessageIds).length,
    [selectedMessageIds],
  );

  const getMessageId = useCallback(message => {
    const resolvedId = message?.message_id || message?.id;
    return String(resolvedId || '').trim();
  }, []);

  const clearSelectionMode = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedMessageIds({});
  }, []);

  const enterSelectionMode = useCallback(messageId => {
    const id = String(messageId || '').trim();
    if (!id) {
      return;
    }
    setIsSelectionMode(true);
    setSelectedMessageIds(prev => ({...prev, [id]: true}));
  }, []);

  const toggleMessageSelection = useCallback(messageId => {
    const id = String(messageId || '').trim();
    if (!id) {
      return;
    }
    setIsSelectionMode(true);
    setSelectedMessageIds(prev => {
      const next = {...prev};
      if (next[id]) {
        delete next[id];
      } else {
        next[id] = true;
      }
      return next;
    });
  }, []);

  const selectedMessages = useMemo(() => {
    const selected = [];
    timelineItems.forEach(item => {
      if (item?.type !== 'message') {
        return;
      }
      const messageId = getMessageId(item?.data);
      if (messageId && selectedMessageIds[messageId]) {
        selected.push(item.data);
      }
    });
    return selected;
  }, [getMessageId, selectedMessageIds, timelineItems]);

  const handleCopySelectedMessages = useCallback(() => {
    if (selectedMessages.length === 0) {
      showToast('No messages selected', 'error');
      return;
    }
    const ordered = [...selectedMessages].sort(
      (a, b) => (a?.timestamp || 0) - (b?.timestamp || 0),
    );
    const payload = ordered
      .map(message => {
        const isSent = String(message?.sender_id || '') === String(currentUserId || '');
        const senderName = isSent ? 'You' : getContactFirstName();
        const timeLabel = formatTimeLabel(message?.timestamp);
        const textValue = String(message?.message_text || '').trim();
        return `${senderName} â€¢ ${timeLabel}\n${textValue}`;
      })
      .join('\n\n');

    Clipboard.setString(payload);
    showToast(
      `${ordered.length} message${ordered.length > 1 ? 's' : ''} copied`,
      'success',
    );
    clearSelectionMode();
  }, [
    clearSelectionMode,
    currentUserId,
    formatTimeLabel,
    getContactFirstName,
    selectedMessages,
    showToast,
  ]);

  const handleDeleteSelectedMessages = useCallback(() => {
    const ids = Object.keys(selectedMessageIds);
    if (ids.length === 0) {
      showToast('No messages selected', 'error');
      return;
    }
    const count = ids.length;
    showAppAlert(
      'Delete Messages',
      `Delete ${count} selected message${count > 1 ? 's' : ''}?`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            let cancelledLocalIds = [];
            try {
              setLoading(true);
              const outgoing = timelineItems.filter(item => item.type === 'message' &&
                item.data?.sender_id === currentUserId && ids.includes(getMessageId(item.data)));
              await Promise.all(outgoing.map(item => cancelComposerSend(getMessageId(item.data), currentUserId)));
              cancelledLocalIds = outgoing.filter(item => item.data?.local_only).map(item => getMessageId(item.data));
              if (cancelledLocalIds.length) onMessagesDeleted?.(cancelledLocalIds);
              deleteMessagesHard(ids);
              const persistedIds = ids.filter(id => !cancelledLocalIds.includes(id));
              if (persistedIds.length) onMessagesDeleted?.(persistedIds);

              if (conversationId) {
                const latestMessage = getLatestConversationMessage(conversationId);
                updateConversation(conversationId, {
                  lastMessageText: latestMessage?.message_text || '',
                  lastMessageTimestamp: latestMessage?.timestamp || 0,
                });
                await loadUnifiedTimeline(conversationId, {force: true});
              }

              showToast(
                `${count} message${count > 1 ? 's' : ''} deleted`,
                'success',
              );
              clearSelectionMode();
            } catch (error) {
              console.error('Failed to delete selected messages:', error);
              if (cancelledLocalIds.length === ids.length) clearSelectionMode();
              showToast(cancelledLocalIds.length
                ? 'Pending sends cancelled. Some history could not be deleted.'
                : 'Failed to delete selected messages', 'error');
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  }, [
    clearSelectionMode,
    conversationId,
    deleteMessagesHard,
    getMessageId,
    getLatestConversationMessage,
    loadUnifiedTimeline,
    onMessagesDeleted,
    currentUserId,
    timelineItems,
    selectedMessageIds,
    setLoading,
    showToast,
    updateConversation,
  ]);

  return {
    isSelectionMode,
    selectedMessageIds,
    selectedCount,
    clearSelectionMode,
    enterSelectionMode,
    toggleMessageSelection,
    handleCopySelectedMessages,
    handleDeleteSelectedMessages,
  };
};

export default useLedgerSelectionMode;
