// Metro for the kit app. Everything is shared with the product clients: see
// clients/expo-build/metro-workspace.js for what it does and why.
//
// `.cjs` rather than `.js`: this package is `"type": "module"` (it is a Vite
// site as well as an Expo app), so a plain `.js` config would be loaded as ESM
// and `module.exports` would be undefined. Metro searches for `.cjs` too.
//
// Nothing local to add - the kit imports @kroma/ui by its package name and
// nothing else - and `unstable_allowRequireContext`, which src/stories.ts needs
// to find the stories, is already turned on by the factory.

const { expoWorkspaceConfig } = require('../expo-build/metro-workspace.ts');

// `icons: 'full'`: the kit IS the icon gallery. It renders `iconNames()`, which
// answers from whatever set shipped, so the subset every product client gets
// would cut the gallery to 243 of Tabler's 6167.
module.exports = expoWorkspaceConfig(__dirname, {}, { icons: 'full' });
