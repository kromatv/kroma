// The folder layout is the contract: `<id>/module.json` and `<id>/locales/*.json`
// are injected into the `defineModule({ ... })` call in `<id>/ui/src/index.tsx`.

import type { Plugin } from 'vite';

// `<id>/ui/src/index.tsx` (compiled-in) or `module.tsx` (Module Federation).
const MODULE_ENTRY = /[\\/]ui[\\/]src[\\/](?:index|module)\.tsx?$/;

// The explicit `defineModule(manifest, { ... })` form deliberately does not
// match, leaving an escape hatch for tests and non-plugin builds.
const OPTIONS_ONLY_CALL = /\bdefineModule\s*\(\s*\{/;

/** Add to the Vite config of anything that bundles module UIs. Relative paths
 *  resolve from the entry file, so each module gets its own manifest/locales. */
export function kromaModule(): Plugin {
  return {
    name: 'kroma-module',
    // Before Vite's own `import.meta.glob` transform, so core expands the
    // injected glob.
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?', 1)[0] ?? id;
      if (!MODULE_ENTRY.test(file) || !OPTIONS_ONLY_CALL.test(code)) return null;
      const injected = `import __kromaManifest from '../../module.json';\n${code}`.replace(
        OPTIONS_ONLY_CALL,
        "defineModule({ manifest: __kromaManifest, locales: import.meta.glob('../../locales/*.json', { eager: true, import: 'default' }),",
      );
      return { code: injected, map: null };
    },
  };
}
