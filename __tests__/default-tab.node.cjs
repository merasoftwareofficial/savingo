// Run: node --test __tests__/default-tab.node.cjs
// Startup tab SSOT (src/utils/defaultTabPreference.js) with in-memory AsyncStorage.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const quiet = {log() {}, warn() {}, error() {}};

function load(initial = {}) {
  const store = new Map(Object.entries(initial));
  const AsyncStorage = {
    getItem: async key => (store.has(key) ? store.get(key) : null),
    setItem: async (key, value) => { store.set(key, String(value)); },
    multiGet: async keys => keys.map(key => [key, store.has(key) ? store.get(key) : null]),
    multiSet: async pairs => pairs.forEach(([key, value]) => store.set(key, String(value))),
  };
  const filename = path.join(__dirname, '../src/utils/defaultTabPreference.js');
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
    console: quiet, Date, JSON, Number, String, Math, Boolean,
  }, {filename});
  return {pref: module.exports, store};
}

test('new user (orchestrator wrote Auto) opens Ledger Talk', async () => {
  const {pref, store} = load({home_default_tab: 'Auto'});
  assert.equal(await pref.resolveStartupTab(), 'Ledger');
  assert.equal(store.get('home_default_tab'), 'Auto');
  assert.equal(store.get('home_last_tab'), undefined);
});

test('fresh install with nothing stored opens Ledger Talk', async () => {
  const {pref} = load();
  assert.equal(await pref.resolveStartupTab(), 'Ledger');
  assert.equal(await pref.readDefaultTabPreference(), 'Auto');
});

for (const oldTab of ['Dashboard', 'Accounts', 'Ledger']) {
  test(`existing user with ${oldTab} moves to Auto and still opens ${oldTab} first`, async () => {
    const {pref, store} = load({home_default_tab: oldTab});
    assert.equal(await pref.resolveStartupTab(), oldTab);
    assert.equal(store.get('home_default_tab'), 'Auto');
    assert.equal(store.get('home_last_tab'), oldTab);
    assert.equal(store.get('home_default_tab.autoMigrated.v1'), 'true');
  });
}

test('migration runs once: a later fixed choice is kept', async () => {
  const {pref} = load({home_default_tab: 'Dashboard'});
  await pref.resolveStartupTab();
  await pref.writeDefaultTabPreference('Accounts');
  await pref.recordLastUsedTab('Ledger');
  assert.equal(await pref.resolveStartupTab(), 'Accounts');
});

test('Auto opens the last used tab; More is never recorded', async () => {
  const {pref} = load({home_default_tab: 'Auto', 'home_default_tab.autoMigrated.v1': 'true'});
  await pref.recordLastUsedTab('Accounts');
  await pref.recordLastUsedTab('More');
  assert.equal(await pref.resolveStartupTab(), 'Accounts');
});

test('reset (key deleted after migration) falls back to Auto', async () => {
  const {pref} = load({'home_default_tab.autoMigrated.v1': 'true', home_last_tab: 'Dashboard'});
  assert.equal(await pref.readDefaultTabPreference(), 'Auto');
  assert.equal(await pref.resolveStartupTab(), 'Dashboard');
});

test('invalid stored values are safe', async () => {
  const {pref} = load({home_default_tab: 'garbage', home_last_tab: 'More', 'home_default_tab.autoMigrated.v1': 'true'});
  assert.equal(await pref.resolveStartupTab(), 'Ledger');
  assert.equal(pref.normalizeDefaultTab(' ledger '), 'Ledger');
  assert.equal(pref.normalizeDefaultTab('AUTO'), 'Auto');
  assert.equal(pref.getDefaultTabLabel('Auto'), 'Automatic');
  assert.equal(pref.getDefaultTabLabel('Ledger'), 'Ledger Talk');
});

test('badge: A on the open tab in Auto, check on the fixed tab only', () => {
  const {pref} = load();
  assert.equal(pref.getDefaultTabBadge('Accounts', 'Auto', 'Accounts'), 'A');
  assert.equal(pref.getDefaultTabBadge('Dashboard', 'Auto', 'Accounts'), undefined);
  assert.equal(pref.getDefaultTabBadge('Ledger', 'Ledger', 'Accounts'), '✓');
  assert.equal(pref.getDefaultTabBadge('Accounts', 'Ledger', 'Accounts'), undefined);
  assert.equal(pref.getDefaultTabBadge('More', 'Auto', 'More'), undefined);
});

test('hint shows from the 3rd distinct open day and never after it is seen', async () => {
  const {pref} = load();
  const day = d => new Date(2026, 9, d, 10, 0, 0);
  assert.equal(await pref.registerOpenDayAndCheckHint(day(1)), false);
  assert.equal(await pref.registerOpenDayAndCheckHint(day(1)), false);
  assert.equal(await pref.registerOpenDayAndCheckHint(day(2)), false);
  assert.equal(await pref.registerOpenDayAndCheckHint(day(3)), true);
  await pref.markDefaultTabHintSeen();
  assert.equal(await pref.registerOpenDayAndCheckHint(day(4)), false);
});
