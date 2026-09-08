import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { webResolve } from '@kromatv/bundler/rnw';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { iconSubset } from './scripts/icon-subset.ts';

const src = (p: string) => fileURLToPath(new URL(`./src/${p}`, import.meta.url));

const NATIVE = process.env.KROMA_UI_TARGET === 'native';

// Metro's precedence in reverse of the web's: a plain file wins, and `.native.*`
// wins over it. `.web.*` is never seen.
const nativeResolve = {
  alias: [{ find: /^#ui\//, replacement: `${fileURLToPath(new URL('./src', import.meta.url))}/` }],
  extensions: ['.native.tsx', '.native.ts', '.tsx', '.ts', '.jsx', '.js', '.json', '.mjs'],
};

// A native host brings its own React Native, its own SVG renderer and its own
// Expo media; the web build folds the first into react-native-web and never
// reaches the other three.
const NATIVE_EXTERNAL = [
  /^react-native$/,
  /^react-native\//,
  'react-native-svg',
  'expo-image',
  'expo-video',
  /^@tabler\/icons-react-native(?:\/|$)/,
];

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
        for (const swap of ['services/i18n-instance']) {
          if (id.endsWith(`${swap}.ts`)) return readFileSync(src(`${swap}.published.ts`), 'utf8');
        }
        return null;
      },
    },
    {
      name: 'kroma-ui-icon-subset',
      enforce: 'pre' as const,
      load(id: string) {
        if (NATIVE || !id.endsWith('lib/icons/glyph-source.ts')) return null;
        return iconSubset(fileURLToPath(new URL('.', import.meta.url)));
      },
    },
    react(),
  ],
  resolve: NATIVE ? nativeResolve : webResolve(),
  define: { global: 'globalThis', 'process.env.NODE_ENV': '"production"' },
  build: {
    outDir: NATIVE ? 'dist/native' : 'dist',
    assetsInlineLimit: 0,
    emptyOutDir: !NATIVE,
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
        ...(NATIVE ? NATIVE_EXTERNAL : ['react-native-web', /^@tabler\/icons-react(?:\/|$)/]),
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
