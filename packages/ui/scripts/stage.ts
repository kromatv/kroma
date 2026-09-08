// Assembles the publishable @kromatv/ui out of the workspace package, the way
// `ci sdk stage` assembles @kromatv/sdk: the workspace stays private and is
// consumed as source in this repo, and what leaves is a built package whose
// `exports` point at JS and declarations.

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function declarations(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((at) => {
    const path = join(dir, at.name);
    if (at.isDirectory()) return declarations(path);
    return at.name.endsWith('.d.ts') ? [path] : [];
  });
}

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, '..');
const dist = join(pkgRoot, 'dist');

const version = process.argv.includes('--version')
  ? (process.argv[process.argv.indexOf('--version') + 1] ?? '0.0.0')
  : '0.0.0';

rmSync(dist, { recursive: true, force: true });

const run = (...args: string[]) => execFileSync('bun', args, { cwd: pkgRoot, stdio: 'inherit' });

run('x', 'vite', 'build', '--config', 'vite.lib.config.ts');
run('x', 'tsc', '--project', 'tsconfig.dist.json');

// The whole stylesheet as a file, because the `@import "@kromatv/ui/css"`
// directive is expanded by a Vite plugin this package does not ship: a consumer
// imports the CSS instead. Subset to what the kit's own source names.
const { fontsCss, tokensCss, themeCss, motionCss, resetCss, pageCss } = await import(
  '../vite/tokens.ts'
);
const kitSrc = join(pkgRoot, 'src');
const sheet = [
  fontsCss(),
  tokensCss([kitSrc]),
  themeCss(),
  motionCss(),
  resetCss(),
  pageCss(),
].join('\n\n');

// `fontsCss()` writes the absolute path each face was read from, which is a path
// on the machine that built it. The faces ship beside the sheet instead.
cpSync(join(kitSrc, 'assets', 'fonts'), join(dist, 'fonts'), {
  recursive: true,
  filter: (from) => !from.includes('upstream') && !from.endsWith('.ttf'),
});
writeFileSync(
  join(dist, 'styles.css'),
  sheet.replace(/url\("[^"]*\/assets\/fonts\/([^"/]+)"\)/g, 'url("./fonts/$1")'),
);

// `IconName` is derived from a type-only namespace import of Tabler's REACT
// NATIVE package, which the build aliases to the DOM one and the declaration
// emit does not. Left alone, a consumer resolves the namespace to nothing and
// every icon name fails to typecheck. The two packages export the same names,
// which is what the alias has always claimed.
for (const file of declarations(dist)) {
  const before = readFileSync(file, 'utf8');
  const after = before.replaceAll('@tabler/icons-react-native', '@tabler/icons-react');
  if (after !== before) writeFileSync(file, after);
}

const source = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'));

// A subpath ships as its built pair. `types` first: a consumer's `moduleResolution`
// reads the condition order, and a `.d.ts` beside the `.js` is not enough on its own.
const entry = (name: string, from: string) => [
  name,
  { types: `./${from}.d.ts`, default: `./${from}.js` },
];

const manifest = {
  name: '@kromatv/ui',
  version,
  description: source.description ?? 'The KROMA design system.',
  license: source.license ?? 'MIT',
  repository: source.repository,
  type: 'module',
  sideEffects: ['*.css'],
  exports: Object.fromEntries([
    entry('.', 'kit'),
    entry('./kit', 'kit'),
    entry('./tokens', 'tokens'),
    entry('./atomic', 'atomic'),
    entry('./intl', 'intl'),
    entry('./device-store', 'device-store'),
    entry('./remote-keys', 'remote-keys'),
    entry('./testing', 'testing'),
    entry('./i18n', 'i18n-host'),
    ['./styles.css', './styles.css'],
  ]),
  // The kit spells its own files `#ui/*`, and 166 of the emitted declarations
  // still say so. Node and TypeScript both read an `imports` map from the
  // package that declares it, so the specifier resolves inside the tarball.
  imports: { '#ui/*': { types: './*.d.ts', default: './*.js' } },
  peerDependencies: {
    react: '>=18',
    'react-dom': '>=18',
    'react-native-web': '>=0.21',
    '@tabler/icons-react': '>=3',
  },
  peerDependenciesMeta: { '@tabler/icons-react': { optional: false } },
  publishConfig: { access: 'public' },
};

writeFileSync(join(dist, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
for (const file of ['README.md', 'LICENSE']) {
  const from = join(pkgRoot, file);
  if (existsSync(from)) cpSync(from, join(dist, file));
}

console.log(`staged @kromatv/ui@${version} into ${dist}`);
