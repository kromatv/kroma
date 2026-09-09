// Proves the staged kit from outside this repo.
//
// Everything that has gone wrong with this package went wrong in the artifact
// rather than the source, and looked fine from inside the workspace: glyph
// imports rewritten to a path in this machine's bun store, `@font-face` naming
// woff2 files on the disk that built them, a stylesheet that only existed as a
// Vite plugin, and an `IconName` union that resolved to `''` because the
// declarations named a package the manifest does not have as a peer. None of
// those are visible until something that is not KROMA installs the tarball and
// builds against it. So that is what this does.

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(pkgRoot, 'dist');

const run = (cmd: string, args: string[], cwd: string) =>
  execFileSync(cmd, args, { cwd, stdio: 'inherit' });

const isTarball = (name: string) => name.endsWith('.tgz');

if (!readdirSync(dist).some(isTarball)) run('npm', ['pack', '--silent'], dist);

const tarball = readdirSync(dist).find(isTarball);
if (!tarball) throw new Error(`no tarball in ${dist}, and npm pack produced none`);
const packed = join(dist, tarball);

const app = mkdtempSync(join(tmpdir(), 'kroma-ui-smoke-'));
mkdirSync(join(app, 'src'), { recursive: true });

writeFileSync(
  join(app, 'package.json'),
  `${JSON.stringify({ name: 'kroma-ui-smoke', private: true, type: 'module' }, null, 2)}\n`,
);
writeFileSync(
  join(app, 'vite.config.ts'),
  `import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: [{ find: /^react-native$/, replacement: 'react-native-web' }] },
  define: { global: 'globalThis' },
});
`,
);
writeFileSync(
  join(app, 'tsconfig.json'),
  `${JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        lib: ['ES2022', 'DOM'],
        module: 'ESNext',
        moduleResolution: 'bundler',
        jsx: 'react-jsx',
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        types: ['vite/client'],
      },
      include: ['src'],
    },
    null,
    2,
  )}\n`,
);
writeFileSync(
  join(app, 'index.html'),
  '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>\n',
);
// A component, a glyph the kit draws, a glyph it does not, and a catalog of the
// host's own: the four things a consumer has to be able to do.
writeFileSync(
  join(app, 'src', 'main.tsx'),
  `import '@kromatv/ui/styles.css';
import { IconHeart } from '@tabler/icons-react';
import { createRoot } from 'react-dom/client';
import { addGlyphs, Button, Icon, Text } from '@kromatv/ui';
import { createI18n, I18nProvider, setKitI18n } from '@kromatv/ui/i18n';

addGlyphs({ IconHeart });
const i18n = createI18n({ catalogs: { en: { 'player.play': 'Play' } }, defaultLocale: 'en' });
setKitI18n(i18n, 'en');

function App() {
  return (
    <I18nProvider locale="en">
      <Text variant="body">hello</Text>
      <Button variant="primary" icon="player-play-filled" label="Play" onPress={() => {}} />
      <Icon name="heart" size={24} color="danger" />
    </I18nProvider>
  );
}

const el = document.getElementById('root');
if (el) createRoot(el).render(<App />);
`,
);

const deps = [
  'react',
  'react-dom',
  'react-native-web',
  '@tabler/icons-react',
  'vite',
  '@vitejs/plugin-react',
  'typescript',
  '@types/react',
  '@types/react-dom',
];

try {
  run('npm', ['install', '--silent', '--no-audit', '--no-fund', ...deps], app);
  run('npm', ['install', '--silent', '--no-audit', '--no-fund', packed], app);
  run('npx', ['tsc', '--noEmit'], app);
  run('npx', ['vite', 'build'], app);
  console.log(`\n[kroma-ui] the staged package builds outside the repo (${app})`);
} finally {
  rmSync(app, { recursive: true, force: true });
}
