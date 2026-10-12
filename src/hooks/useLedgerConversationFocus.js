import {useCallback, useEffect, useRef} from 'react';
import {AppState, InteractionManager} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {
  clearCurrentOpenConversation,
  setConversationScreenFocused,
  setCurrentOpenConversation,
} from '../utils/conversationState';
import {clearActiveConversation, setActiveConversation} from '../services/chatSystem';

const useLedgerConversationFocus = ({
  navigation,
  conversationId,
  contactRecordId,
  restoredTabBarStyle,
  isScreenFocusedRef,
  onScreenFocusSync,
}) => {
  const onScreenFocusSyncRef = useRef(onScreenFocusSync);

  useEffect(() => {
    onScreenFocusSyncRef.current = onScreenFocusSync;
  }, [onScreenFocusSync]);

  useFocusEffect(
    useCallback(() => {
      const parent = navigation.getParent();
      let deferredSyncTimer = null;

      if (isScreenFocusedRef) isScreenFocusedRef.current = true;
      const appStateSubscription = AppState.addEventListener('change', state => {
        setActiveConversation({conversationId, contactRecordId, focused: true, visible: state === 'active'});
        if (state === 'active') onScreenFocusSyncRef.current?.();
      });

      setConversationScreenFocused(true);
      setActiveConversation({
        conversationId,
        contactRecordId,
        focused: true,
        visible: AppState.currentState === 'active',
      });
      if (conversationId) {
        setCurrentOpenConversation(conversationId);
      }

      const applyHide = () => {
        parent?.setOptions({
          tabBarStyle: {display: 'none'},
        });
      };

      const hideTask = InteractionManager.runAfterInteractions(applyHide);
      const syncTask = InteractionManager.runAfterInteractions(() => {
        deferredSyncTimer = setTimeout(() => {
          onScreenFocusSyncRef.current?.();
        }, 180);
      });

      return () => {
        if (isScreenFocusedRef) isScreenFocusedRef.current = false;
        appStateSubscription.remove();
        hideTask.cancel();
        syncTask.cancel();
        if (deferredSyncTimer) {
          clearTimeout(deferredSyncTimer);
        }
        setConversationScreenFocused(false);
        clearCurrentOpenConversation();
        clearActiveConversation();
        parent?.setOptions({
          tabBarStyle: restoredTabBarStyle,
        });
      };
    }, [navigation, restoredTabBarStyle, conversationId, contactRecordId, isScreenFocusedRef]),
  );

  useEffect(() => {
    if (isScreenFocusedRef?.current) {
      setActiveConversation({
        conversationId,
        contactRecordId,
        focused: true,
        visible: AppState.currentState === 'active',
      });
      if (conversationId) {
        setCurrentOpenConversation(conversationId);
      }
      setConversationScreenFocused(true);
    }
  }, [conversationId, contactRecordId, isScreenFocusedRef]);
};

export default useLedgerConversationFocus;
