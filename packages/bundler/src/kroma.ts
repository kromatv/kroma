import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectBuildInfo, productVersion } from '@kroma/build-info';
import { buildInfoPlugin } from '@kroma/bundler/build-info';
import { depsWithoutMaps } from '@kroma/bundler/deps-without-maps';
import { exitAfterBuild } from '@kroma/bundler/exit-after-build';
import { kromaMdx } from '@kroma/bundler/mdx';
import { reactCompiler } from '@kroma/bundler/react-compiler';
import {
  KROMA_SOURCE_PACKAGES,
  RNW_DEFINE,
  RNW_OPTIMIZE_DEPS,
  RNW_SSR_NO_EXTERNAL,
  webResolve,
} from '@kroma/bundler/rnw';
import { kromaDomains } from '@kroma/client/vite';
import { kromaCatalogs } from '@kroma/core/vite';
import { kromaI18nDevtools } from '@kroma/i18n-devtools/vite';
import { kromaUI } from '@kroma/ui/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import type { Plugin, PluginOption } from 'vite';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

export interface KromaOptions {
  /** Import aliases. A relative path resolves against the config's root:
   *  `{ '#web': './src' }`. Listed order is match order. */
  alias?: Record<string, string>;
  /** Packages to resolve to one copy, beyond React and react-native-web. */
  dedupe?: string[];
  /** Compile the kit's `.docs.mdx`, for a shell that mounts the workbench. */
  mdx?: boolean;
  /** TanStack Start, placed before React as it requires, with the build made
   *  to exit once its prerender has finished. */
  start?: Parameters<typeof tanstackStart>[0];
}

function buildDefine(dir: string): Record<string, string> {
  const info = collectBuildInfo(dir, { version: productVersion(REPO_ROOT) ?? 'dev' });
  return {
    __KROMA_VERSION__: JSON.stringify(info.version),
    __KROMA_BUILD__: JSON.stringify(info),
  };
}

function shell({ alias = {}, dedupe }: KromaOptions): Plugin {
  return {
    name: 'kroma:shell',
    config(user) {
      const root = resolve(user.root ?? '.');
      const absolute = Object.fromEntries(
        Object.entries(alias).map(([find, to]) => [find, resolve(root, to)]),
      );
      return {
        define: { ...RNW_DEFINE, ...buildDefine(root) },
        resolve: webResolve(absolute, dedupe),
        // The kit ships raw TypeScript, and the aliases land two transitive
        // deps on ESM builds Node cannot resolve on its own.
        ssr: { noExternal: [...KROMA_SOURCE_PACKAGES, ...RNW_SSR_NO_EXTERNAL] },
        optimizeDeps: RNW_OPTIMIZE_DEPS,
        server: { fs: { allow: [REPO_ROOT] } },
      };
    },
  };
}

/**
 * Everything a KROMA shell takes from the workspace, as one plugin entry: the
 * config every shell shares (react-native-web resolution, the build identity,
 * SSR externals, the dependency pre-bundle), the dev server's dependency maps
 * stripped, the message catalogs found, typed and bundled per screen, the
 * design system's tokens, icons and fonts, the i18n dev tools, and React with
 * the compiler's auto-memoisation. A shell's own config adds only what is its
 * own.
 */
export function kroma(options: KromaOptions = {}): PluginOption[] {
  const { mdx = false, start } = options;
  return [
    shell(options),
    depsWithoutMaps(),
    buildInfoPlugin(),
    kromaCatalogs(),
    kromaDomains(),
    kromaUI(),
    kromaI18nDevtools(),
    mdx ? kromaMdx() : [],
    start ? [tanstackStart(start), exitAfterBuild()] : [],
    react(),
    reactCompiler(),
  ];
}
