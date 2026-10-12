import {NativeModules} from 'react-native';

// Native snapshots transfer to the existing durable outbox, never to another sender.
export const getPendingComposerSends = (ownerId, conversationId) =>
  NativeModules.ChatComposerStorage.getPendingSends(ownerId, conversationId);

export const acknowledgeComposerSend = (messageId, ownerId) =>
  NativeModules.ChatComposerStorage.acknowledgeSend(messageId, ownerId);

export const cancelComposerSend = (messageId, ownerId) =>
  NativeModules.ChatComposerStorage.cancelSend(messageId, ownerId);

// Cached native state only: no async gap between checking ownership and outbox commit.
export const isComposerSendPending = (messageId, ownerId) =>
  NativeModules.ChatComposerStorage.isPendingSend(messageId, ownerId);

export const isComposerOwnerCurrent = ownerId =>
  NativeModules.ChatComposerStorage.isCurrentOwner(ownerId);
