import { fileURLToPath } from 'node:url';
import { gitHistory } from '@kroma/bundler/git-history';
import { kromaMdx } from '@kroma/bundler/mdx';
import { propDocs } from '@kroma/bundler/props-docs';
import { WEB_EXTENSIONS } from '@kroma/bundler/rnw';
import { kromaModule } from '@kroma/module-sdk/vite';
import { configDefaults, defineConfig } from 'vitest/config';

const dir = (p: string) => fileURLToPath(new URL(p, import.meta.url));

const plugins = () => [
  // Real prop docs (not a stub) - the only way stories.web.ts can be imported
  // under the runner at all.
  propDocs({ tsconfig: dir('./packages/ui/tsconfig.json') }),
  // Real history too, for the same reason: the kit's own source binding imports
  // the virtual module the plugin serves.
  gitHistory({ repo: dir('.'), root: 'packages/ui/src' }),
  // A story's prose is a `.docs.mdx`, which the runner has to compile like a
  // shell does.
  kromaMdx(),
  // Without this, `defineModule({ ... })` throws "no manifest" on import: a
  // module's entry file imports neither its manifest nor its locales.
  kromaModule(),
];

// Shared by both projects below: they differ only in which half of a platform
// split wins.
const alias = [
  { find: /^#tv\//, replacement: dir('./packages/tv/src/') },
  { find: /^#ui\//, replacement: dir('./packages/ui/src/') },
  { find: /^#web\//, replacement: dir('./clients/web/src/') },
  // @kroma/ui is written against React Native, which under the test runner
  // (as in every browser target) resolves to react-native-web.
  { find: /^react-native$/, replacement: 'react-native-web' },
  // Mirrors packages/bundler/src/rnw.ts.
  { find: /^@tabler\/icons-react-native$/, replacement: '@tabler/icons-react' },
  // workerd's own module. The stand-in throws exactly as the platform's absence
  // does unless a test names the ambient bindings on `globalThis.KROMA_WORKERD`.
  {
    find: /^cloudflare:workers$/,
    replacement: dir('./packages/site-kit/test/cloudflare-workers.ts'),
  },
  // The spatial navigator's webpack UMD bundle resolves its own `require`s past
  // the alias above and lands on React Native's Flow source ("Unexpected token
  // 'typeof'"); point the runner at its TS sources instead.
  {
    find: /^react-tv-space-navigation$/,
    replacement: dir(
      './node_modules/.bun/react-tv-space-navigation@6.0.0-beta1/node_modules/react-tv-space-navigation/src/index.ts',
    ),
  },
];

// bun installs per workspace, so a renderer test can otherwise end up with
// @testing-library's React and the component's React being two different
// physical copies ("Invalid hook call"). Collapse them onto the root install.
const dedupe = ['react', 'react-dom', 'react-native-web'];

// zod: force Vite's `import` condition (built index.js) over Bun's
// `@zod/source` condition (raw TS, whose `z` export is undefined here).
// React Native packages must be inlined, not externalised: an externalised
// dep is loaded by Node directly, bypassing the `react-native` ->
// `react-native-web` alias and hitting Flow source.
const server = { deps: { inline: ['zod', /react-native/, /@tabler\/icons-react-native/] } };

// jsdom only provides localStorage on a real origin; on the default
// about:blank the origin is opaque and the property is undefined.
const environmentOptions = { jsdom: { url: 'http://localhost/' } };

// Pure-logic unit tests run in the `node` environment (no DOM); a file that
// needs one opts in with `// @vitest-environment jsdom`.
const environment = 'node';

// @testing-library only auto-installs its unmount-after-each-test hook when
// the runner exposes globals, which this project does not.
const setupFiles = [dir('./vitest.setup.ts')];

// Every workspace, at the four places a test is allowed to live: the package
// root (`@kroma/lan-beacon`, whose entry point IS its root), its source tree,
// and the build-time trees beside it (`worker/`, `bundler/`, `vite/`).
const include = [
  '{apps,packages,clients}/*/*.test.ts',
  '{apps,packages,clients}/*/{src,worker,bundler,vite}/**/*.test.{ts,tsx}',
  'modules/*/ui/src/**/*.test.{ts,tsx}',
];

// Same roots, spelled `*.native.test.*`; derived rather than duplicated so
// the two projects cannot drift apart in coverage.
const nativeInclude = include.map((p) => p.replace('*.test.', '*.native.test.'));

export default defineConfig({
  test: {
    // Two projects: this repo has two resolution universes (web precedence vs.
    // Metro precedence), and a `.web` twin is unreachable at any specifier from
    // whichever project doesn't own its half.
    projects: [
      {
        plugins: plugins(),
        // `.web.*` wins over the plain file, mirroring the shells' Vite config.
        resolve: { alias, extensions: WEB_EXTENSIONS, dedupe },
        test: {
          name: 'web',
          environment,
          environmentOptions,
          setupFiles,
          include,
          // Overriding `exclude` replaces the defaults (incl. node_modules).
          exclude: [...configDefaults.exclude, '**/*.native.test.*'],
          server,
        },
      },
      {
        plugins: plugins(),
        // Metro's precedence: the plain file wins, `.web.*` is never consulted
        // unless named outright. Derived from the web list so an extension
        // can't be added to one universe and forgotten in the other.
        resolve: {
          alias,
          extensions: WEB_EXTENSIONS.filter((e) => !e.startsWith('.web.')),
          dedupe,
        },
        test: {
          name: 'native',
          environment,
          environmentOptions,
          setupFiles,
          include: nativeInclude,
          server,
        },
      },
    ],
    coverage: {
      // v8 needs node:inspector coverage APIs Bun doesn't implement.
      provider: 'istanbul',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      // Without this, a file no test imports is absent from the report rather
      // than reported at zero, so the local number reads far higher than the
      // one Sonar computes over the same tree. `.tsx` is left out because
      // sonar.coverage.exclusions leaves it out, and the two must agree.
      // Deliberately no `all`: the report covers what the tests loaded, and
      // SONAR is what measures the tree. Instrumenting every file here produces
      // a third number that matches neither this one nor Sonar's, because
      // Sonar's scope is `sonar.sources` minus `sonar.exclusions`, a far larger
      // list than the coverage exclusions and one that would have to be
      // duplicated here to agree.
    },
  },
});
