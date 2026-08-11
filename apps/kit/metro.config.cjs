// `.cjs` rather than `.js`: this package is `"type": "module"`, so a plain `.js`
// config would be loaded as ESM and `module.exports` would be undefined.

const { expoWorkspaceConfig } = require('../../clients/expo-build/metro-workspace.ts');

// `icons: 'full'`: the kit IS the icon gallery, so the product clients' subset
// would cut it to 243 of Tabler's 6167.
module.exports = expoWorkspaceConfig(__dirname, {}, { icons: 'full' });
