const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const projectRoot = __dirname;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const blockedRoots = [
  'backup',
  'workbackup',
  '.git',
  '.idea',
  'android/build',
  'android/.gradle',
  'ios/build',
].map(folder => path.resolve(projectRoot, folder));

const blockList = blockedRoots.map(
  folder => new RegExp(`^${escapeRegExp(folder)}[\\\\/].*`),
);

const config = {
  resolver: {
    blockList,
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
