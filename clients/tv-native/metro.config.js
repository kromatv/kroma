// Metro for the native TV client. Everything shared with the mobile client lives
// in the workspace factory; what is local is the `#tv/*` subpath alias that
// @kroma/tv uses internally (it mirrors tsconfig.base paths).

const path = require('node:path');
const { expoWorkspaceConfig } = require('../expo-build/metro-workspace');

module.exports = expoWorkspaceConfig(__dirname, {
  '#tv': path.resolve(__dirname, '../../packages/tv/src'),
});
