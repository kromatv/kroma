// Metro for the mobile client. Everything is shared with the native TV client:
// see clients/expo-build/metro-workspace.js for what it does and why.

const { expoWorkspaceConfig } = require('../expo-build/metro-workspace');

module.exports = expoWorkspaceConfig(__dirname);
