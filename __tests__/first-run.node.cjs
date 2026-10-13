// Run: node --test __tests__/first-run.node.cjs
// First-start popups (src/utils/welcomePopupManager.js) with in-memory AsyncStorage.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');

function load(initial = {}) {
  const store = new Map(Object.entries(initial));
  const AsyncStorage = {
    getItem: async key => (store.has(key) ? store.get(key) : null),
    setItem: async (key, value) => { store.set(key, String(value)); },
    multiGet: async keys => keys.map(key => [key, store.has(key) ? store.get(key) : null]),
    multiSet: async pairs => pairs.forEach(([key, value]) => store.set(key, String(value))),
  };
  const filename = path.join(__dirname, '../src/utils/welcomePopupManager.js');
  const code = babel.transformSync(readFileSync(filename, 'utf8'), {
    filename, babelrc: false, configFile: false,
    plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
  }).code;
  const module = {exports: {}};
  vm.runInNewContext(code, {
    module, exports: module.exports,
    require: key => {
      if (key === '@react-native-async-storage/async-storage') return {__esModule: true, default: AsyncStorage};
      throw new Error('Unexpected import: ' + key);
    },
    Date, Number, String, Object, parseInt,
  }, {filename});
  return {m: module.exports, store};
}

const DAY = 24 * 60 * 60 * 1000;
const T0 = 1_760_000_000_000;

test('new install: intro on first start, until it is closed', async () => {
  const {m, store} = load();
  assert.equal((await m.initWelcomePopup(T0)).kind, 'intro');
  assert.equal(store.get('welcome.firstOpenAt.v1'), String(T0));
  assert.equal((await m.initWelcomePopup(T0 + 1000)).kind, 'intro');
  await m.markIntroSeen();
  assert.equal((await m.initWelcomePopup(T0 + 2000)).kind, null);
});

test('developer note only after 7 days, once', async () => {
  const {m} = load();
  await m.initWelcomePopup(T0);
  await m.markIntroSeen();
  assert.equal((await m.initWelcomePopup(T0 + 6 * DAY)).kind, null);
  assert.equal((await m.initWelcomePopup(T0 + 7 * DAY)).kind, 'devNote');
  await m.markDevNoteShown();
  assert.equal((await m.initWelcomePopup(T0 + 30 * DAY)).kind, null);
});

test('users who saw the old welcome popup get neither', async () => {
  for (const legacy of [{'welcome.sessionCount.v1': '1'}, {'welcome.sessionCount.v1': '2'}, {'welcome.permanentlyDismissed.v1': 'true'}]) {
    const {m, store} = load(legacy);
    assert.equal((await m.initWelcomePopup(T0)).kind, null);
    assert.equal((await m.initWelcomePopup(T0 + 30 * DAY)).kind, null);
    assert.equal(store.get('welcome.introSeen.v1'), 'true');
    assert.equal(store.get('welcome.devNoteShown.v1'), 'true');
  }
});

test('fresh-install notice list contains the credit card notice key', () => {
  const filename = path.join(__dirname, '../src/utils/featureNotices.js');
  const code = babel.transformSync(readFileSync(filename, 'utf8'), {
    filename, babelrc: false, configFile: false,
    plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
  }).code;
  const module = {exports: {}};
  vm.runInNewContext(code, {module, exports: module.exports}, {filename});
  assert.deepEqual([...module.exports.FRESH_INSTALL_DISMISSED_NOTICE_KEYS], ['creditCardAccounts.noticeDismissed.v1']);
});
