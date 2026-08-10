import { fileURLToPath } from 'node:url';
import { buildInfoPlugin } from '@kroma/bundler/build-info';
import { exitAfterBuild } from '@kroma/bundler/exit-after-build';
import {
  RNW_DEFINE,
  RNW_OPTIMIZE_INCLUDE,
  RNW_SSR_NO_EXTERNAL,
  webResolve,
} from '@kroma/bundler/rnw';
import { standaloneScript } from '@kroma/bundler/standalone-script';
import { kromaModule } from '@kroma/module-sdk/vite';
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { swScript } from './sw.build.ts';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

// In dev the Rust API runs on its own port; Vite reverse-proxies `/api` to it so
// the whole app lives on a single origin (`:3000`) same-origin as prod, no CORS,
// one port to open. Override the target with KROMA_SERVER_URL if the server moved.
const apiTarget = process.env.KROMA_SERVER_URL ?? 'http://localhost:4040';

export default defineConfig({
  // See rnw.ts: react-native-web's Animated reads React Native's `global`.
  define: RNW_DEFINE,
  // Tailwind v4 + TanStack Start in SPA mode + React. The build prerenders only an
  // app shell (index.html) and the client renders/loads at runtime so the whole
  // app ships as static files the Rust server serves on the same origin (the
  // single-binary Synology package). No Node runtime needed in production.
  plugins: [
    // Injects each module's manifest + locales into its defineModule() call by
    // convention (must precede the transforms that expand import.meta.glob).
    kromaModule(),
    // Exposes `virtual:build-info` (version, commit, branch, build date).
    buildInfoPlugin({ projectRoot: fileURLToPath(new URL('.', import.meta.url)) }),
    // The Web Push service worker: fetched by the browser at /sw.js, so nothing
    // imports it and Vite has to be told it exists. Emitted into public/, which
    // the dev server serves and the build copies.
    standaloneScript(swScript),
    tailwindcss(),
    tanstackStart({ spa: { enabled: true } }),
    react(),
    // React Compiler auto-memoizes components/hooks (React 19 default target →
    // uses React's built-in `react/compiler-runtime`, no extra runtime package).
    // Since plugin-react v6 dropped its built-in Babel pass for an Oxc transform,
    // the compiler runs as a separate Rolldown/Babel preset, which also compiles
    // the aliased @kroma/ui / @kroma/core source.
    babel({ presets: [reactCompilerPreset()] }),
    exitAfterBuild(),
  ],
  // `#web/*` → this app's src (mirrors tsconfig.base paths; Vite needs it
  // explicitly), plus the react-native → react-native-web redirect, the `.web.*`
  // precedence and the single-React dedupe every browser target shares
  // (packages/bundler/src/rnw.ts). This app is DOM React, but the shared player
  // chrome it mounts comes from @kroma/ui, which is written once against React
  // Native so it can also run on a TV.
  //
  // `react-call` is deduped on top: its callables keep a module-level store, so a
  // second copy (bundled from a module UI's own node_modules) would give the Root
  // and the `.call()` different stores and the modal would never open.
  resolve: webResolve({ '#web': fileURLToPath(new URL('./src', import.meta.url)) }, ['react-call']),
  server: {
    // Allow importing TS source from the workspace packages (@kroma/ui, @kroma/core).
    fs: { allow: [repoRoot] },
    // Single-port dev: forward `/api/*` (REST + posters + streams + HLS) and the
    // `/api/events` WebSocket (`ws: true`) to the Rust server. The web client is
    // same-origin in dev (see `apiBase()`), so every request rides this proxy.
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true, ws: true },
    },
  },
  // Workspace packages ship raw TS source, so bundle them for SSR rather than
  // externalizing. `RNW_SSR_NO_EXTERNAL` adds the packages that must ride along
  // BECAUSE of `webResolve`'s aliases - it is exported next to them so the
  // alias and its precondition cannot separate.
  ssr: {
    noExternal: ['@kroma/ui', '@kroma/core', ...RNW_SSR_NO_EXTERNAL],
    // Its dist is also a webpack UMD bundle; the SSR module runner executes it
    // as ESM where neither `module` nor `this` exist, so the UMD wrapper
    // crashes. Prebundling converts it to real ESM (and its react-native
    // external lands on react-native-web via the alias). The `>` path is
    // needed because bun's isolated installs only expose it under @kroma/ui.
    optimizeDeps: { include: ['@kroma/ui > react-tv-space-navigation'] },
  },
  optimizeDeps: {
    exclude: ['@kroma/ui', '@kroma/core'],
    include: RNW_OPTIMIZE_INCLUDE,
  },
});
