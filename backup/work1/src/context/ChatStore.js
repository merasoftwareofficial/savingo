import React, {createContext, useContext, useEffect, useState} from 'react';

const initialState = {
  version: 0,
  conversationVersion: {},
};

const listeners = new Set();
let state = initialState;

const emit = (nextState) => {
  state = nextState;
  listeners.forEach(listener => listener(state));
};

export const chatStore = {
  getState: () => state,
  subscribe: (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  emitIncomingMessage: (data) => {
    const conversationId = data?.conversationId || '';
    const next = {
      version: state.version + 1,
      conversationVersion: {
        ...state.conversationVersion,
        [conversationId]: (state.conversationVersion[conversationId] || 0) + 1,
      },
    };
    emit(next);
  },
};

const ChatStoreContext = createContext(state);

export const ChatStoreProvider = ({children}) => {
  const [storeState, setStoreState] = useState(chatStore.getState());

  useEffect(() => chatStore.subscribe(setStoreState), []);

  return (
    <ChatStoreContext.Provider value={storeState}>
      {children}
    </ChatStoreContext.Provider>
  );
};

export const useChatStore = () => useContext(ChatStoreContext);
