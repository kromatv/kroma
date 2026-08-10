// Shared Vite config factory for every TV shell (Tizen, webOS, Android TV, ...).
// Two tiers per target: modern (always) and legacy (opt-in via `legacyChrome`,
// see legacy-css.ts / legacy-finalize.ts).

import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { collectBuildInfo, productVersion } from '@kroma/build-info';
import { legacyFinalize } from '@kroma/bundler/legacy-finalize';
import {
  KROMA_SOURCE_PACKAGES,
  RNW_DEFINE,
  RNW_OPTIMIZE_INCLUDE,
  webResolve,
} from '@kroma/bundler/rnw';
import { tvFrame } from '@kroma/bundler/tv-frame';
import { kromaUi } from '@kroma/ui/bundler';
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import type { ConfigEnv, UserConfig } from 'vite';

export interface TvTarget {
  platform: 'tizen' | 'webos' | 'bench' | 'web';
  port: number;
  chromeFloor?: number;
  legacyChrome?: number;
  deviceDev?: boolean;
}

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
      tailwindcss(),
      react(),
      // The same auto-memoisation the web client gets, over the same kit source
      // (plugin-react v6 dropped its built-in Babel pass, so the compiler runs
      // as a separate preset). A television has the least CPU to spare for a
      // re-render nobody needed.
      babel({ presets: [reactCompilerPreset()] }),
      tvFrame({ enabled: !deviceDev }),
      kromaUi.vite({ repoRoot }),
    ],
    resolve: webResolve({ '#tv': fileURLToPath(new URL('../../packages/tv/src', shellUrl)) }),
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

/** The legacy tier config (only for targets with `legacyChrome`); run this AFTER
 * the modern build, then `bun ../tv-build/check-legacy.ts` to guard the output. */
export function tvShellLegacyConfig(shellUrl: string, target: TvTarget): UserConfig {
  const repoRoot = fileURLToPath(new URL('../..', shellUrl));
  const chrome = target.legacyChrome;
  if (!chrome) throw new Error(`tv.target for ${target.platform} has no legacyChrome`);
  return {
    plugins: [
      tailwindcss(),
      react(),
      // The legacy tier wants this MORE than the modern one: these are the
      // slowest engines KROMA ships to, and the compiler's output is ordinary
      // JS that legacyFinalize goes on to transpile down like everything else.
      babel({ presets: [reactCompilerPreset()] }),
      legacyFinalize({ distDir: fileURLToPath(new URL('dist', shellUrl)), chrome }),
      // Inlines every chunk into one IIFE; without this it duplicates Tabler.
      kromaUi.vite({ repoRoot }),
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
    define: {
      ...RNW_DEFINE,
      ...TV_TIER,
      'import.meta.url': 'document.baseURI',
      'globalThis.__KROMA_LEGACY_TIER__': 'true',
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
    // Assets live under dist/legacy/. JS/HTML resolve against dist/index.html
    // (needs the subdirectory); the stylesheet resolves against its own
    // dist/legacy/style.css (the prefix would double up).
    experimental: {
      renderBuiltUrl: (filename: string, { hostType }: { hostType: 'js' | 'css' | 'html' }) =>
        hostType === 'css' ? `./${filename}` : `./legacy/${filename}`,
    },
    build: {
      target: 'es2015',
      outDir: 'dist/legacy',
      emptyOutDir: true,
      cssCodeSplit: false,
      // Keep @layer intact for the post-build pass; legacyFinalize minifies.
      cssMinify: false,
      modulePreload: { polyfill: false },
      reportCompressedSize: true,
      rolldownOptions: {
        input: fileURLToPath(new URL('src/main.legacy.ts', shellUrl)),
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
