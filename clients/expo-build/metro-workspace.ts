// Metro for an Expo client living inside this bun workspace.
//
// Shared by the native TV app and the mobile app, because both face the same
// three problems and had started solving them in two drifting copies.
//
//   1. The @kroma/* packages ship raw TypeScript source and live OUTSIDE the
//      client directory, so Metro has to watch the repo root and be told where
//      the node_modules are. Without this the app cannot import @kroma/ui.
//
//   2. There must be exactly ONE physical copy of React Native in the bundle.
//      This is the big one, and it is not theoretical: every third-party native
//      package (expo-video, expo-font, react-native-svg...) declares
//      `react-native` as a peer, and the installer satisfies those peers with
//      the plain `react-native` package rather than with the alias this repo
//      pins (`npm:react-native-tvos`). The JavaScript then comes from mainline
//      React Native while the app BINARY is compiled against the tvOS fork.
//      Nothing errors: it simply behaves as if the TV never existed. No view is
//      focusable, so the remote does nothing, and `TVFocusGuideView`,
//      `TVEventControl` and `useTVEventHandler` are all undefined.
//
//      So `react-native` is pinned here to the client's own copy, for every
//      module in the graph. It is also what keeps a native module's JS half in
//      step with the half that was compiled into the binary.
//
//   3. `.web.*` files are the browser half of the kit's platform splits. Metro
//      already prefers the platform-specific and plain files, but pinning the
//      resolution keeps a stray `.web` file from ever reaching a native build.

const path = require('node:path');

/**
 * @param {string} projectRoot  the client's own directory (`__dirname`)
 * @param {Record<string, string>} [aliases]  extra module prefix -> directory
 * @param {{ icons?: 'subset' | 'full' }} [ui]  what @kroma/ui ships; `full` is
 *   for an app that REFLECTS over the icon catalogue rather than naming glyphs.
 */
function expoWorkspaceConfig(projectRoot, aliases = {}, ui = {}) {
  const workspaceRoot = path.resolve(projectRoot, '../..');
  // Resolved FROM THE CLIENT, not from this file: this factory lives outside any
  // client and therefore has no node_modules of its own to resolve expo from.
  const { getDefaultConfig } = require(
    require.resolve('expo/metro-config', {
      paths: [projectRoot],
    }),
  );
  const config = getDefaultConfig(projectRoot);

  config.watchFolders = [workspaceRoot];
  config.resolver.nodeModulesPaths = [
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(workspaceRoot, 'node_modules'),
  ];
  // The workspace packages are symlinked; resolve them from their real path so a
  // single copy of React and React Native is used.
  config.resolver.disableHierarchicalLookup = false;
  config.resolver.unstable_enableSymlinks = true;

  // The workbench discovers its stories with `require.context` rather than from
  // a generated list. Metro enables it by default, but it is spelled out so the
  // workbench cannot break silently if that default ever changes.
  config.transformer.unstable_allowRequireContext = true;

  const reactNative = path.resolve(projectRoot, 'node_modules/react-native');
  assertReactNativeMatches(projectRoot, reactNative);

  // Every prefix that must resolve to one specific directory, whatever asked.
  const pinned = {
    // `@kroma/ui`'s own internal subpath alias, declared in its package.json
    // `imports` and mirrored here because Metro does not read that field. Every
    // native client gets it for free: a shell should not have to know that the
    // kit refers to itself as `#ui`. The Vite half is `webResolve` in
    // packages/bundler/src/rnw.ts, and tsconfig.base.json carries the types.
    '#ui': path.join(workspaceRoot, 'packages', 'ui', 'src'),
    ...aliases,
    'react-native': reactNative,
  };

  const previous = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    for (const [prefix, target] of Object.entries(pinned)) {
      if (moduleName === prefix || moduleName.startsWith(`${prefix}/`)) {
        const rest = moduleName.slice(prefix.length);
        return context.resolveRequest(context, path.join(target, rest), platform);
      }
    }
    return (previous ?? context.resolveRequest)(context, moduleName, platform);
  };

  // What the kit needs a bundler to know, shared with the Vite shells so it is
  // stated once: today, the icon subset (@kroma/ui ships all 6167 of Tabler
  // otherwise, because its glyphs resolve by name). Resolved FROM THE CLIENT for
  // the same reason expo/metro-config is - this file has no node_modules.
  const { kromaUi } = require(require.resolve('@kroma/ui/bundler', { paths: [projectRoot] }));
  return kromaUi.metro(config, { repoRoot: workspaceRoot, icons: ui.icons });
}

/**
 * Fails the bundle if the copy being pinned is not the package the client asked
 * for.
 *
 * A client pins React Native through an alias (`"react-native":
 * "npm:react-native-tvos@..."`), and an install can satisfy that name with a
 * DIFFERENT physical package while everything still builds. The result is a
 * bundle that runs and looks fine and is missing an entire platform's API. So
 * the expectation is read from the client's own package.json and checked here,
 * where it costs nothing and fails loudly.
 */
function assertReactNativeMatches(projectRoot, reactNative) {
  const declared = require(path.join(projectRoot, 'package.json')).dependencies?.['react-native'];
  if (typeof declared !== 'string' || !declared.startsWith('npm:')) return;
  // "npm:react-native-tvos@0.86.0-2" -> "react-native-tvos"
  const expected = declared.slice(4).split('@').find(Boolean);
  const actual = require(path.join(reactNative, 'package.json')).name;
  if (actual === expected) return;
  throw new Error(
    `Metro would bundle "${actual}" but ${path.basename(projectRoot)} pins ` +
      `"${expected}". Reinstall (bun install) before bundling: a mismatch here ` +
      'builds cleanly and then behaves as if the platform did not exist.',
  );
}

module.exports = { expoWorkspaceConfig };
