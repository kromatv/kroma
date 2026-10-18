import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { arch, cpus, platform } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const req = createRequire(join(root, 'packages/bundler/package.json'));
const expo = createRequire(
  createRequire(join(root, 'clients/tv-native/package.json')).resolve('babel-preset-expo'),
);
const { transformSync: babel } = req('@babel/core');
const compiler = expo.resolve('babel-plugin-react-compiler');
const ts = req.resolve('@babel/preset-typescript');
const { compileReactSource } = req('@kromatv/bundler/react-compiler-transform');
function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, e.name);
    if (e.isDirectory()) yield* walk(file);
    else if (/\.tsx?$/.test(file) && !/\.(test|stories|demo)\./.test(file)) yield file;
  }
}
const corpus = [...walk(join(root, 'packages/ui/src'))].map((file) => ({
  file,
  source: readFileSync(file, 'utf8'),
}));
const modes = {
  babel: ({ source, file }) =>
    babel(source, {
      filename: file,
      babelrc: false,
      configFile: false,
      sourceMaps: true,
      presets: [[ts, { isTSX: true, allExtensions: true }]],
      plugins: [[compiler, { target: '19' }]],
    }),
  oxc: ({ source, file }) => compileReactSource(source, file),
};
const times = { babel: [], oxc: [] };
const memoizedFiles = { babel: 0, oxc: 0 };
for (const mode of Object.keys(modes)) {
  for (const input of corpus) {
    if (modes[mode](input)?.code?.includes('react/compiler-runtime')) memoizedFiles[mode] += 1;
  }
}
for (let round = 0; round < 5; round++) {
  for (const mode of round % 2 ? ['oxc', 'babel'] : ['babel', 'oxc']) {
    const started = performance.now();
    for (const input of corpus) modes[mode](input);
    times[mode].push((performance.now() - started) / 1000);
  }
}
const median = (a) => [...a].sort((a, b) => a - b)[2];
const corpusHash = createHash('sha256');
for (const input of corpus) corpusHash.update(input.file.slice(root.length)).update(input.source);
const result = {
  host: { platform: platform(), arch: arch(), cpu: cpus()[0]?.model },
  corpusHash: corpusHash.digest('hex'),
  compilerHash: createHash('sha256')
    .update(readFileSync(join(root, 'packages/bundler/src/react-compiler-transform.cjs')))
    .digest('hex'),
  date: new Date().toISOString(),
  node: process.version,
  files: corpus.length,
  memoizedFiles,
  scope:
    'packages/ui/src TypeScript and TSX, same input, React 19, JSX preserved, source maps enabled, one full warmup per compiler; five alternating rounds',
  versions: {
    babel: expo('babel-plugin-react-compiler/package.json').version,
    oxc: req('oxc-transform-react/package.json').version,
  },
  seconds: times,
  medianSeconds: { babel: median(times.babel), oxc: median(times.oxc) },
  speedup: median(times.babel) / median(times.oxc),
};
// Emit data only. The shell owns any explicit redirection to a report file.
console.log(JSON.stringify(result, null, 2));
