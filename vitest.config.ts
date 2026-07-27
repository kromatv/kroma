import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { propDocs } from './clients/tv-build/props-docs';
import { WEB_EXTENSIONS } from './clients/tv-build/rnw';

const dir = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Pure-logic unit tests run in the `node` environment (no DOM). The `#tv`/`#web`
// subpath aliases (from tsconfig paths) are resolved here so source files that
// use them are importable under vitest.
export default defineConfig({
  // `virtual:kroma-props` - the Props tab's data, read by TypeScript's own
  // checker over @kroma/ui. The kit site's config loads this too; it is here so
  // the kit's tests exercise the REAL prop docs rather than a stub, which is the
  // only way `stories.web.ts` can be imported under the runner at all.
  plugins: [propDocs({ tsconfig: dir('./packages/ui/tsconfig.json') })],
  resolve: {
    alias: [
      { find: /^#tv\//, replacement: dir('./packages/tv/src/') },
      { find: /^#ui\//, replacement: dir('./packages/ui/src/') },
      { find: /^#web\//, replacement: dir('./clients/web/src/') },
      // @kroma/ui is written against React Native. Under the test runner (as
      // in every browser target) that resolves to react-native-web, exactly the
      // way the Tizen / webOS / desktop bundles wire it.
      { find: /^react-native$/, replacement: 'react-native-web' },
      // The icons resolve the way they do in every browser target: the kit
      // imports @tabler/icons-react-native, and the web half of that pair is
      // @tabler/icons-react (DOM svg). Mirrors clients/tv-build/rnw.ts.
      { find: /^@tabler\/icons-react-native$/, replacement: '@tabler/icons-react' },
      // The spatial navigator ships a webpack UMD bundle whose `require`s Node
      // resolves itself, which walks straight past the alias above and lands on
      // React Native's Flow source ("Unexpected token 'typeof'"). It also ships
      // its TypeScript sources, so point the runner at those and let Vite
      // transform them like any other source file.
      {
        find: /^react-tv-space-navigation$/,
        replacement: dir(
          './node_modules/.bun/react-tv-space-navigation@6.0.0-beta1/node_modules/react-tv-space-navigation/src/index.ts',
        ),
      },
    ],
    // `.web.*` wins over the plain file, so the kit's web focus engine and web
    // focus transition are what the DOM tests exercise. This mirrors the shells'
    // Vite config; Metro applies the opposite precedence for the native apps.
    extensions: WEB_EXTENSIONS,
    // bun installs per workspace, so a renderer test can otherwise end up with
    // @testing-library's React and the component's React being two different
    // physical copies ("Invalid hook call"). Collapse them onto the root install.
    dedupe: ['react', 'react-dom', 'react-native-web'],
  },
  test: {
    environment: 'node',
    // jsdom only provides localStorage on a real origin: on the default
    // about:blank the origin is opaque and the property is undefined, which is
    // what broke the stored-preference tests.
    environmentOptions: { jsdom: { url: 'http://localhost/' } },
    include: [
      'packages/*/src/**/*.test.ts',
      'packages/*/src/**/*.test.tsx',
      'packages/*/worker/**/*.test.ts',
      'clients/web/src/**/*.test.ts',
      'clients/web/src/**/*.test.tsx',
      'clients/desktop/src/**/*.test.ts',
      // The hosted 10-foot shell. A browser client like the two above, so its
      // logic runs here the same way; without this line its tests are collected
      // by nothing and its files can never be covered.
      'clients/tv-web/src/**/*.test.ts',
      // The phone client's pure logic (paths, manifests, the orphan sweep).
      // Its React Native screens are not testable here, but the lib/ layer is
      // plain TypeScript over a mocked expo-file-system.
      'clients/mobile/src/lib/**/*.test.ts',
      // The kit site is where the workbench is COMPOSED - the tool, the design
      // system's stories, and the config that joins them - so the integration
      // test for all three lives with the config rather than in either package.
      'clients/kit/src/**/*.test.ts',
      'clients/kit/src/**/*.test.tsx',
    ],
    // Inline zod so Vite resolves it (via the `import` condition -> built
    // index.js) instead of Bun externalizing it and matching zod's `@zod/source`
    // condition -> raw TS source, whose `z` export is undefined under the runner.
    // react-native-web ships CommonJS; inlining it lets Vite interop it too.
    // Every React Native package MUST be inlined, not externalised: an
    // externalised dep is loaded by Node directly, which bypasses the
    // `react-native` -> `react-native-web` alias and lands on React Native's
    // Flow source ("SyntaxError: Unexpected token 'typeof'").
    server: {
      deps: { inline: ['zod', /react-native/, /@tabler\/icons-react-native/] },
    },
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
