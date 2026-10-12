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

function messagingFixture(post, {tokenSubject = 'A', nativeOwner = 'A'} = {}) {
  const fixture = chatFixture();
  const service = load('messagingService', {
    '@react-native-firebase/messaging': () => ({}),
    '@react-native-firebase/auth': () => ({currentUser: {uid: 'A', getIdToken: async () => 'token', getIdTokenResult: async () => ({token: 'token', claims: {sub: tokenSubject}})}}),
    '@react-native-async-storage/async-storage': {},
    'react-native': {AppState: {currentState: 'background'}, DeviceEventEmitter: {emit() {}}, Platform: {OS: 'android'}},
    '../context/ChatStore': {chatStore: {emitIncomingMessage() {}}},
    './chatDatabase': fixture.db,
    './chatComposerHandoff': {isComposerOwnerCurrent: owner => owner === nativeOwner},
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

test('composer handoff acknowledgement runs after commit and before transmission', async () => {
  let acknowledged = false;
  const {service, db, sqlite, message} = messagingFixture(async () => {
    assert.equal(acknowledged, true);
    return {response: {ok: true, status: 200}, body: {success: true, status: 'pushed'}};
  });
  await service.sendMessageToUser('B', {...message, onPersisted: async id => {
    assert.equal(db.getMessageById(id).message_text, 'hello');
    assert.equal(db.getPendingMessages('A').length, 1);
    acknowledged = true;
  }});
  assert.equal(acknowledged, true);
  sqlite.close();
});

test('DB commit failure never acknowledges composer text or starts networking', async () => {
  let acknowledged = 0, requests = 0;
  const {service, sqlite, message} = messagingFixture(async () => {requests++; return pushed;});
  sqlite.exec("CREATE TRIGGER reject_send BEFORE INSERT ON messages BEGIN SELECT RAISE(ABORT, 'disk write failure'); END");
  await assert.rejects(service.sendMessageToUser('B', {...message, onPersisted: async () => {acknowledged++;}}), /disk write failure/);
  assert.equal(acknowledged, 0);
  assert.equal(requests, 0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM message_queue').get().n, 0);
  sqlite.close();
});

test('crash-gap replay acknowledges an already sent row without duplicate send or status regression', async () => {
  let requests = 0, acknowledged = 0;
  const {service, db, sqlite, message} = messagingFixture(async () => {
    requests++;
    return {response: {ok: true, status: 200}, body: {success: true, status: 'pushed'}};
  });
  await service.sendMessageToUser('B', message);
  await service.sendMessageToUser('B', {...message, onPersisted: async () => {acknowledged++;}});
  assert.equal(requests, 1);
  assert.equal(acknowledged, 1);
  assert.equal(db.getMessageById('m1').delivery_status, 'sent');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM messages').get().n, 1);
  sqlite.close();
});

test('handoff replay cannot reuse an ID for another recipient or different text', async () => {
  let requests = 0, acknowledged = 0;
  const {service, db, sqlite, message} = messagingFixture(async () => {requests++; throw new Error('offline');});
  await service.sendMessageToUser('B', message);
  await assert.rejects(service.sendMessageToUser('C', {...message, onPersisted: async () => {acknowledged++;}}), /identity mismatch/);
  await assert.rejects(service.sendMessageToUser('B', {...message, messageText: 'other text'}), /identity mismatch/);
  assert.equal(acknowledged, 0);
  assert.equal(requests, 1);
  assert.equal(db.getMessageById('m1').message_text, 'hello');
  sqlite.close();
});

test('pending/queued never display sent ticks; delivered and read remain distinct', () => {
  const {getChatMessageStatus} = load('chatMessageStatus');
  for (const status of ['pending', 'sending', 'queued']) assert.equal(getChatMessageStatus(status).icon, 'time-outline');
  assert.equal(getChatMessageStatus('sent').icon, 'checkmark');
  assert.equal(getChatMessageStatus('delivered').icon, 'checkmark-done');
  assert.equal(getChatMessageStatus('read').read, true);
  assert.equal(getChatMessageStatus('failed').failed, true);
});

test('failed-message retry requeues original ID and produces one stored message', async () => {
  let unavailable = true;
  const {service, db, sqlite, message} = messagingFixture(async () => unavailable
    ? {response: {ok: false, status: 404}, body: {code: 'RECEIVER_UNAVAILABLE'}}
    : {response: {ok: true, status: 200}, body: {success: true, status: 'pushed'}});
  await assert.rejects(service.sendMessageToUser('B', message), /Receiver unavailable/);
  assert.equal(db.getMessageById('m1').delivery_status, 'failed');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM message_queue').get().n, 0);
  unavailable = false;
  await service.sendMessageToUser('B', message);
  assert.equal(db.getMessageById('m1').delivery_status, 'sent');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM messages').get().n, 1);
  sqlite.close();
});

test('failed retry queue rejection rolls back status and keeps failed row recoverable', () => {
  const {db, sqlite, message} = chatFixture();
  db.saveOutgoingMessage(message, message);
  db.removeMessageFromQueue('m1');
  db.updateMessageStatus('m1', 'failed');
  sqlite.exec("CREATE TRIGGER reject_retry BEFORE INSERT ON message_queue BEGIN SELECT RAISE(ABORT, 'disk full'); END");
  assert.throws(() => db.requeueOutgoingMessage('m1', 'B', message), /disk full/);
  assert.equal(db.getMessageById('m1').delivery_status, 'failed');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM message_queue').get().n, 0);
  sqlite.close();
});

test('overlapping sends with the same ID share one transmission', async () => {
  let release, started, requests = 0;
  const start = new Promise(resolve => {started = resolve;});
  const {service, sqlite, message} = messagingFixture(async () => {
    requests++; started();
    return new Promise(resolve => {release = resolve;});
  });
  const first = service.sendMessageToUser('B', message);
  await start;
  assert.equal(await service.sendMessageToUser('B', message), 'm1');
  assert.equal(requests, 1);
  release({response: {ok: true, status: 200}, body: {success: true, status: 'pushed'}});
  await first;
  sqlite.close();
});

test('targeted receipt update preserves other rows and duplicate updates skip rendering', () => {
  const {upsertChatTimelineMessage} = load('chatTimelineUpdates');
  const first = {id: 'msg-a', type: 'message', timestamp: 10, data: {message_id: 'a', timestamp: 10, delivery_status: 'sent', local_only: false}};
  const other = {id: 'txn-1', type: 'transaction', timestamp: 5, data: {amount: 7}};
  const updated = upsertChatTimelineMessage([first, other], {message_id: 'a', timestamp: 10, delivery_status: 'read'});
  assert.equal(updated[1], other);
  assert.equal(updated[0].data.delivery_status, 'read');
  assert.equal(upsertChatTimelineMessage(updated, {message_id: 'a', timestamp: 10, delivery_status: 'read'}), updated);
  assert.equal(upsertChatTimelineMessage(updated, {message_id: 'older', timestamp: 1}, {insertMissing: false}), updated);
});

test('timeline reconciliation preserves unsaved failures and does not regress read status', () => {
  const {reconcileChatTimeline, sameChatTimeline} = load('chatTimelineUpdates');
  const prior = {id: 'msg-a', type: 'message', timestamp: 10, data: {delivery_status: 'read'}};
  const failed = {id: 'msg-b', type: 'message', timestamp: 11, data: {delivery_status: 'failed', local_only: true}};
  const next = reconcileChatTimeline([failed, prior], [{...prior, data: {delivery_status: 'sent'}}]);
  assert.equal(next[0], failed);
  assert.equal(next[1].data.delivery_status, 'read');
  assert.equal(sameChatTimeline(next, next.map(item => ({...item}))), true);
  assert.equal(reconcileChatTimeline(next, next), next);
});

function historyFixture() {
  const fixture = chatFixture();
  fixture.sqlite.exec('CREATE TABLE ledger_transactions (id INTEGER PRIMARY KEY, contact_record_id TEXT, transaction_date INTEGER, amount REAL, is_deleted INTEGER DEFAULT 0)');
  const adapter = {execute(sql, params = []) {
    const statement = fixture.sqlite.prepare(sql);
    return statement.columns().length ? {rows: {_array: statement.all(...params)}} : statement.run(...params);
  }};
  const ledger = load('ledgerDatabase', {'react-native-quick-sqlite': {open: () => adapter}});
  const updates = load('chatTimelineUpdates');
  const history = load('chatHistoryPage', {'./chatDatabase': fixture.db, './ledgerDatabase': ledger, './chatTimelineUpdates': updates});
  return {...fixture, ledger, updates, history};
}

test('mixed history cursor includes every equal-timestamp message and ledger row exactly once', () => {
  const {sqlite, history, updates} = historyFixture();
  const insertMessage = sqlite.prepare("INSERT INTO messages (message_id,conversation_id,sender_id,receiver_id,message_text,timestamp,created_at) VALUES (?, 'A_B','A','B','text',1000,0)");
  const insertTransaction = sqlite.prepare("INSERT INTO ledger_transactions (id,contact_record_id,transaction_date,amount) VALUES (?, 'contact',1000,1)");
  for(let index = 1; index <= 120; index++) {insertMessage.run('m'+index);insertTransaction.run(index);}
  let before = null, items = [], hasMore;
  do {
    const page = history.loadChatHistoryPage({contactRecordId: 'contact', conversationId: 'A_B', limit: 7, before});
    assert.ok(page.items.length <= 7);
    items = updates.appendChatHistoryPage(items, page.items);
    before = page.cursor; hasMore = page.hasMore;
  } while (hasMore);
  assert.equal(items.length, 240);
  assert.equal(new Set(items.map(item => item.id)).size, 240);
  assert.equal(items[0].id, 'txn-99');
  assert.equal(items[items.length-1].id, 'msg-m1');
  sqlite.close();
});

test('new arrivals and deletion between pages do not cause offset skips', () => {
  const {sqlite, history} = historyFixture();
  const insert = sqlite.prepare("INSERT INTO messages (message_id,conversation_id,sender_id,receiver_id,message_text,timestamp,created_at) VALUES (?, 'A_B','A','B','text',?,0)");
  for(let index = 1; index <= 30; index++) insert.run('m'+index, index);
  let page = history.loadChatHistoryPage({contactRecordId: 'contact', conversationId: 'A_B', limit: 5});
  const ids = page.items.map(item => item.id);
  insert.run('new', 100);
  sqlite.exec("DELETE FROM messages WHERE message_id='m10'");
  while(page.hasMore) {
    page = history.loadChatHistoryPage({contactRecordId: 'contact', conversationId: 'A_B', limit: 5, before: page.cursor});
    ids.push(...page.items.map(item => item.id));
  }
  assert.equal(ids.length, 29);
  assert.equal(new Set(ids).size, 29);
  assert.equal(ids.includes('msg-new'), false);
  assert.equal(ids.includes('msg-m10'), false);
  assert.equal(ids.includes('msg-m1'), true);
  sqlite.close();
});

test('composer capture from a previous login cannot enter the new account outbox', async () => {
  let requests = 0, acknowledged = 0;
  const {service, db, sqlite, message} = messagingFixture(async () => {requests++; return pushed;});
  await assert.rejects(service.sendMessageToUser('B', {...message, expectedSenderId: 'previous-account', onPersisted: () => {acknowledged++;}}), /session changed/);
  assert.equal(db.getMessageById('m1'), null);
  assert.equal(requests, 0);assert.equal(acknowledged, 0);
  sqlite.close();
});

test('composer-only acknowledgement and owner checks do not leak into transport payload', async () => {
  const {service, sqlite, message} = messagingFixture(async (_fixture, _url, options) => {
    const payload = JSON.parse(options.body);
    assert.equal('onPersisted' in payload, false);
    assert.equal('expectedSenderId' in payload, false);
    return {response: {ok: true, status: 200}, body: {success: true, status: 'pushed'}};
  });
  await service.sendMessageToUser('B', {...message, expectedSenderId: 'A', onPersisted: async () => {}});
  sqlite.close();
});

test('captured composer conversation must belong to the current sender/recipient pair', async () => {
  let requests = 0;
  const {service, db, sqlite, message} = messagingFixture(async () => {requests++; return pushed;});
  await assert.rejects(service.sendMessageToUser('B', {...message, conversationId: 'old-account_B', expectedSenderId: 'A'}), /conversation changed/);
  assert.equal(db.getMessageById('m1'), null);assert.equal(requests, 0);
  sqlite.close();
});

test('selected unsaved message is cancelled before deletion and cannot be revived by refresh', async () => {
  const events = [];let buttons;let stateCalls = 0;
  let visible = [{id: 'msg-unsaved', type: 'message', timestamp: 10, data: {message_id: 'unsaved', sender_id: 'A', message_text: 'keep safe', delivery_status: 'failed', local_only: true}}];
  const handoff = load('chatComposerHandoff', {'react-native': {NativeModules: {ChatComposerStorage: {
    cancelSend: async (id, owner) => {assert.equal(id, 'unsaved');assert.equal(owner, 'A');events.push('cancel');},
  }}}});
  const selection = load('../hooks/useLedgerSelectionMode', {
    react: {useCallback: fn => fn, useMemo: fn => fn(), useState: () => [stateCalls++ === 0 ? false : {unsaved: true}, () => {}]},
    '@react-native-clipboard/clipboard': {},
    '../context/AppAlertBridge': {showAppAlert: (_title, _message, actions) => {buttons = actions;}},
    '../services/chatComposerHandoff': handoff,
  });
  const {reconcileChatTimeline} = load('chatTimelineUpdates');
  const hook = selection.default({timelineForList: visible, currentUserId: 'A', conversationId: 'A_B',
    getContactFirstName: () => 'Peer',formatTimeLabel: () => '',showToast() {},setLoading() {},
    deleteMessagesHard: ids => {assert.deepEqual(Array.from(ids), ['unsaved']);events.push('delete');},
    onMessagesDeleted: () => {visible = [];events.push('remove-visible');},
    getLatestConversationMessage: () => null,updateConversation() {},
    loadUnifiedTimeline: async (_id, options) => {assert.equal(options.force, true);visible = reconcileChatTimeline(visible, []);},
  });
  hook.handleDeleteSelectedMessages();
  await buttons.find(button => button.text === 'Delete').onPress();
  assert.deepEqual(events, ['cancel', 'remove-visible', 'delete']);
  assert.equal(visible.length, 0);
});

test('persisted sending row removed from DB is not retained as an optimistic orphan', () => {
  const {reconcileChatTimeline} = load('chatTimelineUpdates');
  assert.equal(reconcileChatTimeline([{id: 'msg-deleted', type: 'message', timestamp: 1, data: {delivery_status: 'sending', local_only: false}}], []).length, 0);
});

test('deleted outbox row observed after commit cannot start a transmission', async () => {
  let requests = 0;
  const {service, db, sqlite, message} = messagingFixture(async () => {requests++; return pushed;});
  await service.sendMessageToUser('B', {...message, onPersisted: async () => db.deleteMessagesHard(['m1'])});
  assert.equal(requests, 0);
  assert.equal(db.getMessageById('m1'), null);
  assert.equal(db.getPendingMessages('A').length, 0);
  sqlite.close();
});

test('stale JS login cannot persist a message under the actual native account', async () => {
  let requests = 0;
  const {service, db, sqlite, message} = messagingFixture(async () => {requests++; return pushed;}, {nativeOwner: 'B'});
  await assert.rejects(service.sendMessageToUser('B', message), /Session changed/);
  assert.equal(db.getMessageById('m1'), null);
  assert.equal(requests, 0);
  sqlite.close();
});

test('token subject mismatch is retained locally and never sent using another user credentials', async () => {
  let requests = 0;
  const {service, db, sqlite, message} = messagingFixture(async () => {requests++; return pushed;}, {tokenSubject: 'B'});
  await service.sendMessageToUser('B', message);
  assert.equal(requests, 0);
  assert.equal(db.getMessageById('m1').delivery_status, 'queued');
  assert.equal(db.getPendingMessages('A').length, 1);
  sqlite.close();
});
