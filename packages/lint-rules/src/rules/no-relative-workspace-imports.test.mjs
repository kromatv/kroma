import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { RuleTester } from 'oxlint/plugins-dev';
import rule from './no-relative-workspace-imports.mjs';

RuleTester.describe = describe;
RuleTester.it = it;
const filename = fileURLToPath(new URL('../../../../clients/web/fixture.ts', import.meta.url));
const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'ts' } } });
const source = '../../packages/bundler/src/shell';
tester.run('no-relative-workspace-imports', rule, {
  valid: [
    { filename, code: "import { shell } from '@kromatv/bundler';" },
    { filename, code: "import { shell } from './shell';" },
    { filename, code: "import { shell } from '../web/src/shell';" },
    { filename, code: "import config from '../../vitest.config';" },
    { filename, code: "const name = './shell'; import(name);" },
    {
      filename,
      code: `function load(require: (s: string) => unknown) { return require('${source}'); }`,
    },
    {
      filename,
      code: `const loader = { require(value: string) {} }; loader.require('${source}');`,
    },
    {
      filename: fileURLToPath(new URL('../../../../scripts/fixture.ts', import.meta.url)),
      code: `import '${source}';`,
    },
  ],
  invalid: [
    `import { shell } from '${source}';`,
    `import type { Shell } from '${source}';`,
    `export { shell } from '${source}';`,
    `export * from '${source}';`,
    `import('${source}');`,
    `require('${source}');`,
  ].map((code) => ({ filename, code, errors: [{ messageId: 'boundary' }] })),
});
