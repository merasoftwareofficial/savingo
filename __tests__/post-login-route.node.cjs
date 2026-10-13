// Run: node --test __tests__/post-login-route.node.cjs
// Login always opens the app; profile setup is never forced (startupCoordinator).
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');

function load({gateReady = false} = {}) {
  const store = new Map();
  const AsyncStorage = {
    getItem: async key => (store.has(key) ? store.get(key) : null),
    setItem: async (key, value) => { store.set(key, String(value)); },
    removeItem: async key => { store.delete(key); },
    multiGet: async keys => keys.map(key => [key, store.has(key) ? store.get(key) : null]),
    multiSet: async pairs => pairs.forEach(([key, value]) => store.set(key, String(value))),
    multiRemove: async keys => keys.forEach(key => store.delete(key)),
  };
  const deps = {
    '@react-native-async-storage/async-storage': {__esModule: true, default: AsyncStorage},
    './dbLifecycleManager': {ensureCoreDatabasesReady: () => ({ready: true})},
    './sessionService': {readCachedSessionUser: async () => ({})},
    '../utils/profileSetupGate': {getBackupProfileGateState: async () => ({ready: gateReady})},
  };
  const filename = path.join(__dirname, '../src/services/startupCoordinator.js');
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
    Object, String, Boolean, Array,
  }, {filename});
  return {c: module.exports, store};
}

const NEW_USER = {firebaseUid: 'u1', email: 'a@b.c', setupComplete: false};
const DONE_USER = {firebaseUid: 'u2', email: 'd@e.f', username: 'dee', setupComplete: true};

test('new user (profile incomplete) goes straight to Home, no restore', async () => {
  const {c} = load({gateReady: false});
  const flags = await c.resolveStartupSessionFlagsForUser({userPayload: NEW_USER});
  assert.equal(flags.requiredRoute, 'Home');
  assert.equal(flags.restoreDecisionPending, false);
});

test('complete profile with backup gate ready still gets the restore decision', async () => {
  const {c} = load({gateReady: true});
  const flags = await c.resolveStartupSessionFlagsForUser({userPayload: DONE_USER});
  assert.equal(flags.requiredRoute, 'Home');
  assert.equal(flags.restoreDecisionPending, true);
});

test('an old stored ProfileSetup route is ignored', () => {
  const {c} = load();
  assert.equal(c.getResolvedStartupRequiredRoute({userPayload: NEW_USER, postLoginRequiredRoute: 'ProfileSetup'}), 'Home');
});

test('Boot resolves Home for a signed-in new user; PreparingApp only when restoring', () => {
  const {c} = load();
  const home = c.resolveStartupTargetRoute({
    isAuthenticated: true, currentRouteName: 'Boot', userPayload: NEW_USER,
    restoreDecisionPending: false, postLoginRequiredRoute: 'ProfileSetup',
  });
  assert.equal(home.routeName, 'Home');
  const preparing = c.resolveStartupTargetRoute({
    isAuthenticated: true, currentRouteName: 'Boot', userPayload: DONE_USER,
    restoreDecisionPending: true, postLoginRequiredRoute: 'Home',
  });
  assert.equal(preparing.routeName, 'PreparingApp');
});

test('logout still clears the legacy skip flag', async () => {
  const {c, store} = load();
  store.set('profileSetup.skipped.u1', 'true');
  await c.clearStartupStateForLogout({firebaseUid: 'u1'});
  assert.equal(store.has('profileSetup.skipped.u1'), false);
});
