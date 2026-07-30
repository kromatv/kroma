// Metro for an Expo client in this bun workspace, shared by the mobile app and
// the native TV app.
//
// `react-native` is pinned to the client's own copy for every module in the
// graph: third-party native packages declare a `react-native` peer, which an
// install satisfies with mainline React Native rather than the
// `npm:react-native-tvos` alias this repo pins. Nothing errors — the bundle just
// behaves as if the TV never existed.

const path = require('node:path');

function expoWorkspaceConfig(projectRoot, aliases = {}, ui = {}) {
  const workspaceRoot = path.resolve(projectRoot, '../..');
  // Resolved FROM THE CLIENT: this factory lives outside any client and has no
  // node_modules of its own to resolve expo from.
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
  // Workspace packages are symlinked; resolve them from their real path so a
  // single copy of React and React Native is used.
  config.resolver.disableHierarchicalLookup = false;
  config.resolver.unstable_enableSymlinks = true;

  // The workbench discovers its stories with `require.context`; stated rather
  // than left to Metro's default so it cannot break silently.
  config.transformer.unstable_allowRequireContext = true;

  const reactNative = path.resolve(projectRoot, 'node_modules/react-native');
  assertReactNativeMatches(projectRoot, reactNative);

  const pinned = {
    // `@kroma/ui`'s internal subpath alias, declared in its package.json
    // `imports` and mirrored here because Metro does not read that field.
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

  // What the kit needs a bundler to know, shared with the Vite shells: today,
  // the icon subset (@kroma/ui otherwise ships all 6167 Tabler glyphs, because
  // they resolve by name).
  const { kromaUi } = require(require.resolve('@kroma/ui/bundler', { paths: [projectRoot] }));
  return kromaUi.metro(config, { repoRoot: workspaceRoot, icons: ui.icons });
}

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
