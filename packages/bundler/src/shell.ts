// Shared Vite config factory for every TV shell (Tizen, webOS, Android TV, ...).
// Two tiers per target: modern (always) and legacy (opt-in via `legacyChrome`,
// see legacy-css.ts / legacy-finalize.ts).

import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { collectBuildInfo, productVersion } from '@kroma/build-info';
import { legacyFinalize } from '@kroma/bundler/legacy-finalize';
import { kromaMdx } from '@kroma/bundler/mdx';
import {
  KROMA_SOURCE_PACKAGES,
  RNW_DEFINE,
  RNW_OPTIMIZE_INCLUDE,
  webResolve,
} from '@kroma/bundler/rnw';
import { tvFrame } from '@kroma/bundler/tv-frame';
import { kromaUI } from '@kroma/ui/vite';
import babel from '@rolldown/plugin-babel';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import type { ConfigEnv, UserConfig } from 'vite';

export interface TvTarget {
  platform: 'tizen' | 'webos' | 'bench' | 'web';
  port: number;
  chromeFloor?: number;
  legacyChrome?: number;
  /** Floor of a second legacy tier, for engines below the custom-properties
   * line (M49). Tizen 3.0 is M47. Requires `legacyChrome`; built after it, and
   * it is this tier's build that writes the engine gate into index.html. */
  deepLegacyChrome?: number;
  deviceDev?: boolean;
}

/** Which legacy bundle a config builds. `deep` needs `deepLegacyChrome`. */
export type LegacyTier = 'legacy' | 'deep';

const PROFILE = process.env.KROMA_PROFILE === '1';

function lanIp(): string | undefined {
  if (process.env.KROMA_TV_HOST) return process.env.KROMA_TV_HOST;
  return Object.values(networkInterfaces())
    .flatMap((addrs) => addrs ?? [])
    .find((a) => a.family === 'IPv4' && !a.internal)?.address;
}

/** Vite `define` entries a browser shell bakes in: `__KROMA_VERSION__` (compared
 * by the server-compatibility banner) and `__KROMA_BUILD__` (full commit/branch
 * identity for the About screen). */
export function buildDefine(repoRoot: string, shellDir: string): Record<string, string> {
  const info = collectBuildInfo(shellDir, { version: productVersion(repoRoot) ?? 'dev' });
  return {
    __KROMA_VERSION__: JSON.stringify(info.version),
    __KROMA_BUILD__: JSON.stringify(info),
  };
}

// Which tier is being built, as a member expression rather than a bare global:
// the browser client never defines it, and a bare identifier would throw there
// (same reason as `globalThis.__KROMA_LEGACY_TIER__` below).
//
// What reads it today is the kit's frost. A `backdrop-filter` re-blurs whenever
// anything BEHIND it changes, and a television composites that on the CPU: with
// the sign-in artwork drifting behind the keyboard and the buttons, a 2024
// Samsung panel measured 40fps, and 60 with the blur gone. The browser keeps
// its glass; the sets get the plain wash they already fall back to on the 2019
// engines that ignore the property outright.
const TV_TIER = { 'globalThis.__KROMA_TV_TIER__': 'true' } as const;

export function tvShellConfig(shellUrl: string, target: TvTarget) {
  const repoRoot = fileURLToPath(new URL('../..', shellUrl));
  const shellDir = fileURLToPath(new URL('.', shellUrl));
  const deviceDev = target.deviceDev === true && process.env.KROMA_TV_DEVICE === '1';
  const floor = target.chromeFloor ?? 99;
  return ({ command }: ConfigEnv): UserConfig => ({
    define: { ...buildDefine(repoRoot, shellDir), ...RNW_DEFINE, ...TV_TIER },
    // tvFrame() is dev-only: letterboxes into a 1920x1080 stage in a desktop
    // browser; off in device mode, where the panel already is that canvas.
    plugins: [
      kromaUI(),
      // Before react(): the workbench behind `?workbench` reads the kit's
      // `.docs.mdx` files, which have to be JSX before the React transform.
      kromaMdx(),
      react(),
      // The same auto-memoisation the web client gets, over the same kit source
      // (plugin-react v6 dropped its built-in Babel pass, so the compiler runs
      // as a separate preset). A television has the least CPU to spare for a
      // re-render nobody needed.
      babel({ presets: [reactCompilerPreset()] }),
      tvFrame({ enabled: !deviceDev }),
    ],
    // The workbench is reached through `?workbench`, which a television has no
    // way to ask for: in a package it is a lazy chunk nothing can ever fetch,
    // measured at 169 kB. Stubbed for `build` only, so the dev server keeps it.
    // `#tv/workbench` must come first, since Vite matches string aliases by
    // prefix in order and a bare `#tv` would swallow it.
    resolve: webResolve({
      ...(command === 'build'
        ? { '#tv/workbench': fileURLToPath(new URL('workbench-stub.tsx', import.meta.url)) }
        : {}),
      '#tv': fileURLToPath(new URL('../../packages/tv/src', shellUrl)),
    }),
    // Packaged TV apps load from a local path: assets must be referenced relatively.
    base: './',
    server: {
      host: deviceDev ? true : undefined,
      port: target.port,
      hmr: deviceDev ? { host: lanIp(), protocol: 'ws' } : undefined,
      fs: { allow: [repoRoot] },
    },
    optimizeDeps: {
      exclude: KROMA_SOURCE_PACKAGES,
      include: RNW_OPTIMIZE_INCLUDE,
    },
    // Down-levels modern CSS (color-mix, oklch) to plain fallbacks. Chrome
    // version is encoded as major << 16.
    css: {
      transformer: 'lightningcss',
      lightningcss: { targets: { chrome: floor << 16 } },
    },
    build: {
      target: 'es2020',
      outDir: 'dist',
      // One JS + one CSS file: fewer round-trips on a TV's slow connection.
      cssCodeSplit: false,
      cssMinify: 'lightningcss',
      modulePreload: { polyfill: false },
      reportCompressedSize: true,
      // Mangled names make a profile useless (every frame reads `Zt`); never on
      // for a shipped build, since it's bigger and slower to parse.
      sourcemap: PROFILE,
      rolldownOptions: {
        // vite 8 ignores `esbuild.drop`; dropConsole moved to the oxc minifier.
        output: {
          minify:
            command === 'build' && !PROFILE
              ? { compress: { dropConsole: true, dropDebugger: true }, mangle: true, codegen: true }
              : undefined,
        },
      },
    },
  });
}

// The gate index.html writes, newest engine first. Modern is implicit; each
// legacy tier below it needs a probe for the feature that separates it from the
// next one down, and the last tier is the unconditional fallback. Custom
// properties are the M49 line, which is exactly what splits a 2017 Tizen 3.0
// set (M47) from every set the ordinary legacy tier was built for.
const SUPPORTS_CUSTOM_PROPERTIES =
  "window.CSS && window.CSS.supports && window.CSS.supports('color', 'var(--k)')";

/** The legacy tier config (only for targets with the matching floor); run this
 * AFTER the modern build, deep last, then `bun ../tv-build/check-legacy.ts`. */
export function tvShellLegacyConfig(
  shellUrl: string,
  target: TvTarget,
  tier: LegacyTier = 'legacy',
): UserConfig {
  const repoRoot = fileURLToPath(new URL('../..', shellUrl));
  const deep = tier === 'deep';
  const chrome = deep ? target.deepLegacyChrome : target.legacyChrome;
  if (!chrome) throw new Error(`tv.target for ${target.platform} has no ${tier} chrome floor`);
  const dir = deep ? 'deep' : 'legacy';
  const entry = deep ? 'src/main.deep.ts' : 'src/main.legacy.ts';
  const tiers = target.deepLegacyChrome
    ? [{ dir: 'legacy', probe: SUPPORTS_CUSTOM_PROPERTIES }, { dir: 'deep' }]
    : [{ dir: 'legacy' }];
  // Whichever tier is built last owns the gate, so that it can name them all.
  const gate = dir === tiers.at(-1)?.dir ? tiers : undefined;
  return {
    plugins: [
      kromaUI(),
      react(),
      // The legacy tier wants this MORE than the modern one: these are the
      // slowest engines KROMA ships to, and the compiler's output is ordinary
      // JS that legacyFinalize goes on to transpile down like everything else.
      babel({ presets: [reactCompilerPreset()] }),
      legacyFinalize({
        distDir: fileURLToPath(new URL('dist', shellUrl)),
        chrome,
        dir,
        deep,
        gate,
      }),
    ],
    // `import.meta` doesn't exist in a classic script; the IIFE output substitutes
    // `{}` for it, so `new URL(asset, import.meta.url)` throws at module init.
    // `document.baseURI` resolves the same as the modern tier and exists on
    // every engine this tier targets.
    //
    // The legacy-tier marker folds the html engine's Shaka Player branch to a
    // constant, so `inlineDynamicImports` below does not bake the whole
    // library into a bundle whose engines fail Shaka's support check anyway.
    // The member-expression key (like `import.meta.url` above) matches the
    // `globalThis` property read the player uses - a bare global would throw
    // in the runtimes that never define it.
    // The deep marker is read by the kit's CSS palette: below M49 there are no
    // custom properties, so a token written as `var(--kroma-…)` resolves to
    // nothing and the colour is lost. The tier takes the literal values instead,
    // the same branch native already takes.
    define: {
      ...RNW_DEFINE,
      ...TV_TIER,
      'import.meta.url': 'document.baseURI',
      'globalThis.__KROMA_LEGACY_TIER__': 'true',
      ...(deep ? { 'globalThis.__KROMA_DEEP_TIER__': 'true' } : {}),
    },
    // `#tv/workbench` must come first: Vite matches string aliases by prefix in
    // order, and a bare `#tv` listed first would swallow it.
    resolve: webResolve({
      '#tv/workbench': fileURLToPath(new URL('workbench-stub.tsx', import.meta.url)),
      '#tv': fileURLToPath(new URL('../../packages/tv/src', shellUrl)),
    }),
    base: './',
    // appinfo/manifest + icons are already copied into dist/ by the modern build.
    publicDir: false,
    server: { fs: { allow: [repoRoot] } },
    // Assets live under dist/<tier>/. JS/HTML resolve against dist/index.html
    // (needs the subdirectory); the stylesheet resolves against its own
    // dist/<tier>/style.css (the prefix would double up).
    experimental: {
      renderBuiltUrl: (filename: string, { hostType }: { hostType: 'js' | 'css' | 'html' }) =>
        hostType === 'css' ? `./${filename}` : `./${dir}/${filename}`,
    },
    build: {
      target: 'es2015',
      outDir: `dist/${dir}`,
      emptyOutDir: true,
      cssCodeSplit: false,
      // The post-build pass rewrites this stylesheet; legacyFinalize minifies.
      cssMinify: false,
      modulePreload: { polyfill: false },
      reportCompressedSize: true,
      rolldownOptions: {
        input: fileURLToPath(new URL(entry, shellUrl)),
        output: {
          // No <script type=module> on old engines: one classic self-contained file.
          format: 'iife',
          inlineDynamicImports: true,
          entryFileNames: 'index.js',
          assetFileNames: (info: { names?: string[] }) =>
            (info.names?.[0] ?? '').endsWith('.css')
              ? 'style.css'
              : 'assets/[name]-[hash][extname]',
          minify: {
            compress: { dropConsole: true, dropDebugger: true },
            mangle: true,
            codegen: true,
          },
        },
      },
    },
  };
}
