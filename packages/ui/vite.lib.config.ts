import { fileURLToPath } from 'node:url';
import { webResolve } from '@kromatv/bundler/rnw';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

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
        '@tabler/icons-react',
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
