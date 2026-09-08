import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { webResolve } from '@kromatv/bundler/rnw';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { iconSubset } from './scripts/icon-subset.ts';

const src = (p: string) => fileURLToPath(new URL(`./src/${p}`, import.meta.url));

export default defineConfig({
  plugins: [
    // The brand intro's 4K master and its sting are 11 MB of KROMA, and the
    // component already falls back to its CSS scene when the video will not
    // play. `new URL(asset, import.meta.url)` is read by Vite's asset plugin
    // rather than through `resolve.alias`, so it is intercepted here.
    {
      name: 'kroma-ui-drop-brand-media',
      enforce: 'pre' as const,
      transform(code: string, id: string) {
        if (!id.endsWith('kroma-intro/constants.ts')) return null;
        return code.replace(/new URL\([^)]*kroma-intro[^)]*\)\.href/g, "''");
      },
    },
    {
      // The published kit speaks a host's catalogs, not KROMA's.
      name: 'kroma-ui-inject-i18n',
      enforce: 'pre' as const,
      load(id: string) {
        for (const swap of ['services/i18n-instance', 'lib/genre-icon']) {
          if (id.endsWith(`${swap}.ts`)) return readFileSync(src(`${swap}.published.ts`), 'utf8');
        }
        return null;
      },
    },
    {
      name: 'kroma-ui-icon-subset',
      enforce: 'pre' as const,
      load(id: string) {
        return id.endsWith('lib/icons/glyph-source.ts')
          ? iconSubset(fileURLToPath(new URL('.', import.meta.url)))
          : null;
      },
    },
    react(),
  ],
  resolve: webResolve(),
  define: { global: 'globalThis', 'process.env.NODE_ENV': '"production"' },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    emptyOutDir: true,
    minify: false,
    sourcemap: true,
    lib: {
      entry: {
        kit: src('kit.ts'),
        tokens: src('core/tokens/index.ts'),
        atomic: src('core/atomic/index.ts'),
        intl: src('lib/intl.ts'),
        'device-store': src('lib/device-store.ts'),
        'remote-keys': src('lib/remote-keys.ts'),
        testing: src('testing.tsx'),
        'i18n-host': src('i18n-host.ts'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        'react-dom/client',
        'react-native-web',
        /^@tabler\/icons-react(?:\/|$)/,
      ],
      output: {
        preserveModules: true,
        preserveModulesRoot: 'src',
        entryFileNames: '[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
