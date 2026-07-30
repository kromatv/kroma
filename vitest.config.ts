import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';
import { propDocs } from './clients/tv-build/props-docs';
import { WEB_EXTENSIONS } from './clients/tv-build/rnw';
// By relative path, like propDocs above: the root workspace does not depend on
// @kroma/module-sdk, so its published specifier is not resolvable from here.
import { kromaModule } from './packages/module-sdk/vite';

const dir = (p: string) => fileURLToPath(new URL(p, import.meta.url));

const plugins = () => [
  // `virtual:kroma-props` - the Props tab's data, read by TypeScript's own
  // checker over @kroma/ui. The kit site's config loads this too; it is here so
  // the kit's tests exercise the REAL prop docs rather than a stub, which is the
  // only way `stories.web.ts` can be imported under the runner at all.
  propDocs({ tsconfig: dir('./packages/ui/tsconfig.json') }),
  // A module's entry file imports neither its manifest nor its locales - the
  // folder layout is the contract, and this plugin is what fills them in. Every
  // shell that bundles module UIs has it, so the runner needs it too: without
  // it `defineModule({ ... })` throws "no manifest" on IMPORT, which makes the
  // app's whole module roster unloadable in a test.
  kromaModule(),
];

// The `#tv`/`#web` subpath aliases (from tsconfig paths) are resolved here so
// source files that use them are importable under vitest. Shared by both
// projects below: those differ ONLY in which half of a platform split wins.
const alias = [
  { find: /^#tv\//, replacement: dir('./packages/tv/src/') },
  { find: /^#ui\//, replacement: dir('./packages/ui/src/') },
  { find: /^#web\//, replacement: dir('./clients/web/src/') },
  // The showcase site. Only its generated-code-free modules are tested (the rich-text
  // parser, the content-locale convention, the blog and legal loaders), which is why
  // this alias never has to resolve `#site/paraglide/*`: that directory is written by
  // the vite plugin at build time and is not in the repo, so a test that needed it
  // would pass or fail depending on whether someone had built the site first.
  { find: /^#site\//, replacement: dir('./clients/site/src/') },
  // @kroma/ui is written against React Native. Under the test runner (as in
  // every browser target) that resolves to react-native-web, exactly the way the
  // Tizen / webOS / desktop bundles wire it. This holds for the native project
  // too: react-native-web is the runtime SHIM either way, because React Native's
  // own source is Flow and Vite cannot parse it. What the native project changes
  // is FILE PRECEDENCE, not the shim.
  { find: /^react-native$/, replacement: 'react-native-web' },
  // The icons resolve the way they do in every browser target: the kit imports
  // @tabler/icons-react-native, and the web half of that pair is
  // @tabler/icons-react (DOM svg). Mirrors clients/tv-build/rnw.ts.
  { find: /^@tabler\/icons-react-native$/, replacement: '@tabler/icons-react' },
  // The spatial navigator ships a webpack UMD bundle whose `require`s Node
  // resolves itself, which walks straight past the alias above and lands on
  // React Native's Flow source ("Unexpected token 'typeof'"). It also ships its
  // TypeScript sources, so point the runner at those and let Vite transform them
  // like any other source file.
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

// Inline zod so Vite resolves it (via the `import` condition -> built index.js)
// instead of Bun externalizing it and matching zod's `@zod/source` condition ->
// raw TS source, whose `z` export is undefined under the runner.
// react-native-web ships CommonJS; inlining it lets Vite interop it too.
// Every React Native package MUST be inlined, not externalised: an externalised
// dep is loaded by Node directly, which bypasses the `react-native` ->
// `react-native-web` alias and lands on React Native's Flow source
// ("SyntaxError: Unexpected token 'typeof'").
const server = { deps: { inline: ['zod', /react-native/, /@tabler\/icons-react-native/] } };

// jsdom only provides localStorage on a real origin: on the default about:blank
// the origin is opaque and the property is undefined, which is what broke the
// stored-preference tests.
const environmentOptions = { jsdom: { url: 'http://localhost/' } };

// Pure-logic unit tests run in the `node` environment (no DOM); a file that
// needs one opts in with `// @vitest-environment jsdom`.
const environment = 'node';

// Unmount what a test rendered, after every test. @testing-library installs this
// itself only when the runner exposes globals, which this project does not - so
// without the file it is never installed and nothing says so. See the file for
// what that leaks.
const setupFiles = [dir('./vitest.setup.ts')];

const include = [
  'packages/*/src/**/*.test.ts',
  'packages/*/src/**/*.test.tsx',
  'packages/*/worker/**/*.test.ts',
  'clients/web/src/**/*.test.ts',
  'clients/web/src/**/*.test.tsx',
  'clients/desktop/src/**/*.test.ts',
  // The hosted 10-foot shell. A browser client like the two above, so its logic
  // runs here the same way; without this line its tests are collected by nothing
  // and its files can never be covered.
  'clients/tv-web/src/**/*.test.ts',
  // The showcase site (kroma.tv). Its pages are prose and layout, so what is worth
  // testing is the pure logic underneath: the rich-text parser that carries markup
  // through a translated string, and the resolver that turns content/blog into
  // typed posts.
  'clients/site/src/**/*.test.ts',
  // The phone client's pure logic - device storage and the session, the player's
  // capability model, the sign-in flow. Its React Native SCREENS are not
  // testable here, and they do not need excluding by path: a screen's test would
  // be a `.tsx`, and only `.ts` is collected from this client.
  'clients/mobile/src/**/*.test.ts',
  // The native TV shell (Apple TV / Android TV). Same rule as the phone: its
  // screens are `.tsx`, so only the plain-TypeScript layer is collected - the
  // device session store, the launcher links, the Siri search bridge.
  'clients/tv-native/src/**/*.test.ts',
  // The build-identity collector. Not a client: it runs in Node at build time
  // and is required by an Expo app.config.js, which is why it has no src/.
  'clients/build-info/**/*.test.ts',
  // The web client's own build-time plugin, which sits beside its vite config
  // rather than under src/.
  'clients/web/*.test.ts',
  // The Samsung TV client. Its background preview service is a Tizen JS service
  // that ships verbatim from public/, so its test lives under src/ and loads the
  // file - without this line nothing collects it and it can never be covered.
  'clients/tizen/src/**/*.test.ts',
  // The kit site is where the workbench is COMPOSED - the tool, the design
  // system's stories, and the config that joins them - so the integration test
  // for all three lives with the config rather than in either package.
  'clients/kit/src/**/*.test.ts',
  'clients/kit/src/**/*.test.tsx',
];

/** The same roots, spelled `*.native.test.*`. DERIVED rather than written out a
 *  second time, so the two projects cannot end up covering different parts of
 *  the repo. */
const nativeInclude = include.map((p) => p.replace('*.test.', '*.native.test.'));

export default defineConfig({
  test: {
    // Two projects, because this repo has two resolution universes and a runner
    // that models only one of them can never execute half of a platform split.
    //
    // 25 source files here have a `.web` twin. Under web precedence `./css` IS
    // `css.web.ts`, and the native `css.ts` is unreachable at any specifier - so
    // those 25 native halves ship with no test that can even load them.
    //
    // A test covering BOTH halves of a pair belongs in the native project: from
    // there each half has a clean specifier (`./css` is native, `./css.web` is
    // web), whereas from the web project the native half has none.
    projects: [
      {
        plugins: plugins(),
        // `.web.*` wins over the plain file, so the kit's web focus engine and
        // web focus transition are what the DOM tests exercise. This mirrors the
        // shells' Vite config.
        resolve: { alias, extensions: WEB_EXTENSIONS, dedupe },
        test: {
          name: 'web',
          environment,
          environmentOptions,
          setupFiles,
          include,
          // Overriding `exclude` REPLACES the defaults, which is how node_modules
          // gets scanned; keep them and add the other project's files.
          exclude: [...configDefaults.exclude, '**/*.native.test.*'],
          server,
        },
      },
      {
        plugins: plugins(),
        // Metro's precedence: the plain file wins, and a `.web.*` sibling is
        // never consulted unless it is named outright. Derived from the web
        // order by dropping the `.web.*` entries, so an extension cannot be
        // added to one universe and forgotten in the other.
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
      // istanbul (source-instrumented) works under Bun's runtime; the v8
      // provider needs node:inspector coverage APIs Bun doesn't implement.
      // Emits lcov for SonarCloud (coverage/lcov.info) + a text summary in CI.
      // Scope/exclusions live in sonar-project.properties.
      provider: 'istanbul',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
    },
  },
});
