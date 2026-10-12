// Run: node --test __tests__/delivery-foundation.node.cjs
// Real SQLite transactions; platform/network adapters are isolated in memory.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {DatabaseSync} = require('node:sqlite');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const quiet = {log() {}, warn() {}, error() {}};

function load(name, deps = {}, globals = {}) {
  const filename = path.join(__dirname, '../src/services', name + '.js');
  const code = babel.transformSync(readFileSync(filename, 'utf8'), {
    filename, babelrc: false, configFile: false,
    plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
  }).code;
  const module = {exports: {}};
  vm.runInNewContext(code, {
    module, exports: module.exports,
    require: key => {
      if (!(key in deps)) throw new Error('Unexpected import: ' + key);
      return deps[key];
    },
    console: quiet, setTimeout, clearTimeout, AbortController,
    __DEV__: false, ...globals,
  }, {filename});
  return module.exports;
}

function chatFixture() {
  const sqlite = new DatabaseSync(':memory:');
  const adapter = {
    execute(sql, params = []) {
      const statement = sqlite.prepare(sql);
      if (statement.columns().length) return {rows: {_array: statement.all(...params)}};
      const result = statement.run(...params);
      return {insertId: Number(result.lastInsertRowid), rowsAffected: Number(result.changes)};
    },
    close() {},
  };
  const db = load('chatDatabase', {'react-native-quick-sqlite': {open: () => adapter}});
  db.initChatDatabase();
  db.createConversation('B', {displayName: 'B'}, 'A');
  const message = {
    messageId: 'm1', conversationId: 'A_B', senderId: 'A', receiverId: 'B',
    messageText: 'hello', messageType: 'text', timestamp: 123, deliveryStatus: 'sending',
  };
  return {db, sqlite, message};
}

test('read upgrade bypasses delivered backoff without allowing old failure to delay it', () => {
  const {db, sqlite} = chatFixture();
  db.queueDeliveryReceipt('A', 'B', 'incoming', 'delivered');
  const delivered = db.getPendingReceipts('A')[0];
  db.deferDeliveryReceipt(delivered, 300000);
  assert.equal(db.getPendingReceipts('A').length, 0);
  db.queueDeliveryReceipt('A', 'B', 'incoming', 'read');
  db.deferDeliveryReceipt(delivered, 300000);
  const ready = db.getPendingReceipts('A');
  assert.equal(ready.length, 1);
  assert.equal(ready[0].status, 'read');
  assert.equal(ready[0].retry_count, 0);
  sqlite.close();
});

test('sender status recovery pages only own unread rows on the real messages schema', () => {
  const {db, sqlite, message} = chatFixture();
  for (const [messageId, status] of [['m1', 'sent'], ['m2', 'read'], ['m3', 'delivered']]) {
    db.saveOutgoingMessage({...message, messageId}, {...message, messageId});
    db.updateMessageStatus(messageId, status);
  }
  db.saveIncomingMessage({...message, messageId: 'in1', senderId: 'B', receiverId: 'A',
    deliveryStatus: 'delivered'}, {receiptStatus: 'delivered', incrementUnread: true});
  const firstPage = db.getMessagesAwaitingRead('A');
  assert.deepEqual(firstPage.map(row => row.message_id), ['m1', 'm3']);
  assert.ok(firstPage[0].id < firstPage[1].id);
  assert.deepEqual(db.getMessagesAwaitingRead('A', firstPage[0].id).map(row => row.message_id), ['m3']);
  assert.deepEqual(db.getMessagesAwaitingRead('A', firstPage[1].id), []);
  sqlite.close();
});

test('focused chat in background is delivered, never silently marked seen', () => {
  const AppState = {currentState: 'active'};
  const system = load('chatSystem', {
    'react-native': {AppState}, './chatDatabase': {}, './chatNotificationV2Service': {},
  });
  system.setActiveConversation({conversationId: 'A_B', focused: true, visible: true});
  assert.equal(system.evaluateIncomingMessage({conversationId: 'A_B'}).receiptStatus, 'read');
  AppState.currentState = 'background';
  const policy = system.evaluateIncomingMessage({conversationId: 'A_B'});
  assert.equal(policy.receiptStatus, 'delivered');
  assert.equal(policy.showNotification, true);
});

test('outgoing message and queue commit together; disk rejection rolls both back', () => {
  const {db, sqlite, message} = chatFixture();
  sqlite.exec("CREATE TRIGGER reject_queue BEFORE INSERT ON message_queue BEGIN SELECT RAISE(ABORT, 'disk failure'); END;");
  assert.throws(() => db.saveOutgoingMessage(message, message), /disk failure/);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM messages').get().n, 0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM message_queue').get().n, 0);
  sqlite.exec('DROP TRIGGER reject_queue');
  db.saveOutgoingMessage(message, message);
  assert.equal(db.getPendingMessages('A').length, 1);
  assert.equal(db.getPendingMessages('B').length, 0);
  sqlite.close();
});

test('queue survives repeated failures; duplicate enqueue preserves one event', () => {
  const {db, sqlite, message} = chatFixture();
  db.saveOutgoingMessage(message, message);
  db.queueMessage(message.messageId, 'B', message);
  sqlite.exec('UPDATE message_queue SET retry_count = 9, next_retry_at = 0');
  assert.equal(db.getPendingMessages('A').length, 1);
  assert.equal(db.getPendingMessages('A')[0].retry_count, 9);
  sqlite.close();
});

test('read/delivered never regress under delayed send/error writes', () => {
  const {db, sqlite, message} = chatFixture();
  db.saveOutgoingMessage(message, message);
  db.updateMessageStatus('m1', 'delivered');
  db.updateMessageStatus('m1', 'sent');
  assert.equal(db.getMessageById('m1').delivery_status, 'delivered');
  db.updateMessageStatus('m1', 'read');
  for (const status of ['queued', 'failed', 'sending', 'sent', 'delivered']) db.updateMessageStatus('m1', status);
  assert.equal(db.getMessageById('m1').delivery_status, 'read');
  sqlite.close();
});

test('incoming message cannot commit without its delivery receipt', () => {
  const {db, sqlite, message} = chatFixture();
  const incoming = {...message, senderId: 'B', receiverId: 'A', deliveryStatus: 'delivered'};
  const policy = {receiptStatus: 'delivered', incrementUnread: true};
  sqlite.exec("CREATE TRIGGER reject_receipt BEFORE INSERT ON receipt_queue BEGIN SELECT RAISE(ABORT, 'receipt failure'); END;");
  assert.throws(() => db.saveIncomingMessage(incoming, policy), /receipt failure/);
  assert.equal(db.getMessageById('m1'), null);
  sqlite.exec('DROP TRIGGER reject_receipt');
  db.saveIncomingMessage(incoming, policy);
  assert.equal(db.getPendingReceipts('A').length, 1);
  assert.equal(db.getUnreadCount('A_B'), 1);
  sqlite.close();
});

test('seen queues all 150 receipts atomically; in-flight delivered ack cannot remove read', () => {
  const {db, sqlite, message} = chatFixture();
  for (let i = 0; i < 150; i++) db.insertMessage({...message, messageId: 'in' + i, senderId: 'B', receiverId: 'A'});
  db.queueDeliveryReceipt('A', 'B', 'in0', 'delivered');
  const inFlight = db.getPendingReceipts('A')[0];
  db.markConversationReadWithReceipts('A_B', 'A');
  db.completeDeliveryReceipt(inFlight);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM receipt_queue WHERE status='read'").get().n, 150);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM messages WHERE is_read=0').get().n, 0);
  assert.equal(db.getPendingReceipts('B').length, 0);
  sqlite.close();
});

test('legacy sending row is recovered with original ID, payload, timestamp and owner', () => {
  const {db, sqlite, message} = chatFixture();
  db.insertMessage(message);
  db.recoverOutgoingQueue('B');
  assert.equal(db.getPendingMessages('A').length, 0);
  db.recoverOutgoingQueue('A');
  db.recoverOutgoingQueue('A');
  const rows = db.getPendingMessages('A');
  assert.equal(rows.length, 1);
  assert.equal(JSON.parse(rows[0].message_data).timestamp, 123);
  assert.equal(rows[0].message_id, 'm1');
  sqlite.close();
});

function ledgerFixture(post, {initial = [], writeError = false} = {}) {
  let user = {uid: 'A', getIdToken: async () => 'token'};
  const storage = new Map([['ledgerSyncQueue:v1', JSON.stringify(initial)]]);
  const transport = {deliveryRetryDelay: () => 10000, deliveryFetch: post};
  const ledger = load('ledgerSyncService', {
    '@react-native-firebase/auth': () => ({currentUser: user}),
    '@react-native-async-storage/async-storage': {
      getItem: async key => storage.get(key) ?? null,
      setItem: async (key, value) => {
        if (writeError) throw new Error('storage full');
        storage.set(key, value);
      },
    },
    'react-native': {AppState: {currentState: 'background'}},
    './deliveryTransport': transport,
  });
  return {
    ledger, storage, queue: () => JSON.parse(storage.get('ledgerSyncQueue:v1')),
    switchUser: uid => {user = {uid, getIdToken: async () => 'token'};},
  };
}
const event = id => ({sourceUserId: 'A', peerUserId: 'B', originTxnId: id, contactRecordId: 'app_B', amount: 50, type: 'paid', op: 'create'});
const pushed = {response: {ok: true, status: 200}, body: {success: true, delivered: true}};

test('ledger concurrent enqueue does not lose events or duplicate identities', async () => {
  const {ledger, queue} = ledgerFixture(async () => pushed);
  await Promise.all([ledger.enqueueLedgerEvent(event('1')), ledger.enqueueLedgerEvent(event('2')), ledger.enqueueLedgerEvent(event('1'))]);
  assert.equal(queue().length, 2);
});

test('ledger backend queued flag retains local obligation; no invented durable handoff', async () => {
  const {ledger, queue} = ledgerFixture(async () => ({response: {ok: true, status: 200}, body: {success: true, queued: true}}));
  const result = await ledger.sendLedgerEvent(event('1'), {withResult: true});
  assert.equal(result.queued, true);
  assert.equal(result.delivered, false);
  assert.equal(queue().length, 1);
});

test('ledger event added during network request survives acknowledgement of earlier event', async () => {
  let release, started;
  const startedPromise = new Promise(resolve => {started = resolve;});
  const {ledger, queue} = ledgerFixture(async () => {started(); return new Promise(resolve => {release = resolve;});});
  const send = ledger.sendLedgerEvent(event('1'), {withResult: true});
  await startedPromise;
  await ledger.enqueueLedgerEvent(event('2'));
  release(pushed);
  await send;
  assert.equal(queue().length, 1);
  assert.equal(queue()[0].originTxnId, '2');
});

test('ledger storage failure prevents network send and is not reported as queued', async () => {
  let requests = 0;
  const {ledger} = ledgerFixture(async () => {requests++; return pushed;}, {writeError: true});
  await assert.rejects(ledger.sendLedgerEvent(event('1')), /storage full/);
  assert.equal(requests, 0);
});

test('ledger retry does not send a previous account queue under new credentials', async () => {
  let requests = 0;
  const {ledger, queue, switchUser} = ledgerFixture(async () => {requests++; return pushed;});
  await ledger.enqueueLedgerEvent(event('1'));
  switchUser('C');
  await ledger.processPendingLedgerEvents();
  assert.equal(requests, 0);
  assert.equal(queue().length, 1);
});

test('disabled ledger sync still skips networking and queue creation', async () => {
  let requests = 0;
  const {ledger, queue, storage} = ledgerFixture(async () => {requests++; return pushed;});
  storage.set('ledgerSyncAllEntries:app_B', '0');
  const result = await ledger.sendLedgerEvent(event('1'), {withResult: true});
  assert.equal(result.reason, 'sync_disabled');
  assert.equal(requests, 0);
  assert.equal(queue().length, 0);
});

test('transport deadline covers a hanging response body, not only response headers', async () => {
  const transport = load('deliveryTransport', {}, {
    fetch: async (_, options) => ({text: () => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('aborted')));
    })}),
  });
  await assert.rejects(transport.deliveryFetch('mock', {}, 10), /aborted/);
});

function messagingFixture(post) {
  const fixture = chatFixture();
  const service = load('messagingService', {
    '@react-native-firebase/messaging': () => ({}),
    '@react-native-firebase/auth': () => ({currentUser: {uid: 'A', getIdToken: async () => 'token'}}),
    '@react-native-async-storage/async-storage': {},
    'react-native': {AppState: {currentState: 'background'}, DeviceEventEmitter: {emit() {}}, Platform: {OS: 'android'}},
    '../context/ChatStore': {chatStore: {emitIncomingMessage() {}}},
    './chatDatabase': fixture.db,
    './ledgerDatabase': {}, './chatNotificationV2Service': {}, './chatSystem': {},
    './phoneClaimNotificationService': {}, './phoneClaimNavigationService': {},
    './ledgerChatIdentityService': {}, './ledgerContactBootstrapService': {},
    './deliveryTransport': {deliveryFetch: (...args) => post(fixture, ...args), deliveryRetryDelay: () => 10000},
  });
  return {...fixture, service};
}

test('read queued during delivered request is flushed in the same drain', async () => {
  const statuses = [];
  const {service, db, sqlite} = messagingFixture(async (fixture, url, options) => {
    const payload = JSON.parse(options.body);
    statuses.push(payload.status);
    if (payload.status === 'delivered') fixture.db.queueDeliveryReceipt('A', 'B', 'incoming', 'read');
    return {response: {ok: true, status: 200}, body: {success: true}};
  });
  db.queueDeliveryReceipt('A', 'B', 'incoming', 'delivered');
  await service.processPendingReceipts();
  assert.deepEqual(statuses, ['delivered', 'read']);
  assert.equal(db.getPendingReceipts('A').length, 0);
  sqlite.close();
});

test('receipt drain sends all pages, including more than 100 seen messages', async () => {
  let sent = 0;
  const {service, db, sqlite} = messagingFixture(async () => {
    sent++;
    return {response: {ok: true, status: 200}, body: {success: true}};
  });
  for (let i = 0; i < 150; i++) db.queueDeliveryReceipt('A', 'B', 'incoming' + i, 'read');
  await service.processPendingReceipts();
  assert.equal(sent, 150);
  assert.equal(db.getPendingReceipts('A').length, 0);
  sqlite.close();
});

test('actual send path persists before network and retains offline message for restart', async () => {
  const {service, db, sqlite, message} = messagingFixture(async fixture => {
    assert.equal(fixture.db.getPendingMessages('A').length, 1);
    throw new Error('offline');
  });
  const id = await service.sendMessageToUser('B', message);
  assert.equal(id, message.messageId);
  assert.equal(db.getPendingMessages('A').length, 1);
  assert.equal(db.getMessageById(id).delivery_status, 'queued');
  sqlite.close();
});

test('actual retry retains accepted-only obligation and completes after pushed response', async () => {
  let response = {response: {ok: true, status: 200}, body: {success: true, queued: true, status: 'accepted'}};
  const {service, db, sqlite, message} = messagingFixture(async () => response);
  await service.sendMessageToUser('B', message);
  await service.processPendingMessages();
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM message_queue').get().n, 1);
  sqlite.exec('UPDATE message_queue SET next_retry_at = 0');
  response = {response: {ok: true, status: 200}, body: {success: true, status: 'pushed'}};
  await service.processPendingMessages();
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM message_queue').get().n, 0);
  assert.equal(db.getMessageById('m1').delivery_status, 'sent');
  sqlite.close();
});

test('HTTP 404 receipt is retained with backoff rather than acknowledged as success', async () => {
  const {service, sqlite} = messagingFixture(async () => ({response: {ok: false, status: 404}, body: {success: false}}));
  await service.sendDeliveryReceipt('B', 'incoming', 'read');
  const row = sqlite.prepare('SELECT * FROM receipt_queue').get();
  assert.equal(row.status, 'read');
  assert.equal(row.retry_count, 1);
  assert.ok(row.next_retry_at > Date.now());
  sqlite.close();
});

test('late initial send response cannot overwrite an already received read receipt', async () => {
  const {service, db, sqlite, message} = messagingFixture(async fixture => {
    fixture.db.updateMessageStatus('m1', 'read');
    return {response: {ok: true, status: 200}, body: {success: true, status: 'pushed'}};
  });
  await service.sendMessageToUser('B', message);
  assert.equal(db.getMessageById('m1').delivery_status, 'read');
  sqlite.close();
});

test('retry recognises receiver acknowledgement and never sends that message again', async () => {
  let requests = 0;
  const {service, db, sqlite, message} = messagingFixture(async () => {requests++; throw new Error('unexpected request');});
  db.saveOutgoingMessage(message, message);
  db.updateMessageStatus('m1', 'delivered');
  await service.processPendingMessages();
  assert.equal(requests, 0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM message_queue').get().n, 0);
  sqlite.close();
});
