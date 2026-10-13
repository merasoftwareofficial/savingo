import {useCallback, useRef} from 'react';
import {DeviceEventEmitter} from 'react-native';

// Owns the "draft" state of a contact opened from Add Contact. A draft contact is
// not in the Ledger list yet; it is saved (through the single `ledger:addContact`
// writer in LedgerScreen) only when the first chat message or ledger entry exists.
const useDraftLedgerContact = ({contact, isDraftContact = false}) => {
  const isDraftRef = useRef(isDraftContact === true);
  // Identity updates (install state, userId) seen while still a draft.
  const pendingUpdateRef = useRef(null);

  // Use instead of emitting `ledger:addContact` directly for identity updates:
  // a saved contact is updated as before, a draft only keeps the latest update.
  const emitContactUpdate = useCallback(payload => {
    if (isDraftRef.current) {
      pendingUpdateRef.current = {...(pendingUpdateRef.current || {}), ...(payload || {})};
      return;
    }
    DeviceEventEmitter.emit('ledger:addContact', payload);
  }, []);

  // Call after the first message or entry is persisted. Saves the draft once.
  const persistDraftContactOnce = useCallback(() => {
    if (!isDraftRef.current) {
      return;
    }
    isDraftRef.current = false;
    DeviceEventEmitter.emit('ledger:addContact', {
      ...(contact || {}),
      ...(pendingUpdateRef.current || {}),
      recordID: String(contact?.recordID || '').trim(),
      silent: true,
    });
    pendingUpdateRef.current = null;
  }, [contact]);

  return {emitContactUpdate, persistDraftContactOnce};
};

export default useDraftLedgerContact;
