import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { RuleTester } from 'oxlint/plugins-dev';
import rule from './no-platform-branch.mjs';

RuleTester.describe = describe;
RuleTester.it = (name, fn) => it(name, fn);
const at = (name) =>
  fileURLToPath(new URL(`../../../../packages/ui/src/components/atoms/${name}`, import.meta.url));
const filename = at('fixture.tsx');
const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'tsx' } } });
tester.run('no-platform-branch', rule, {
  valid: [
    { filename, code: "import { Box } from '#ui/components/atoms/box';" },
    { filename, code: "import { View } from 'react-native'; export const v = View;" },
    { filename, code: "import { Platform } from 'react-native'; Platform.constants;" },
    { filename, code: 'const Platform = { OS: 1 }; Platform.OS;' },
    { filename: at('fixture.test.tsx'), code: 'export {};' },
  ],
  invalid: [
    { filename, code: "import { WEB } from '#ui/lib/platform';", errors: [{ messageId: 'flag' }] },
    {
      filename,
      code: "import { WEB } from '#ui/lib/platform.web';",
      errors: [{ messageId: 'flag' }],
    },
    {
      filename,
      code: "import { Platform } from 'react-native'; Platform.OS;",
      errors: [{ messageId: 'flag' }],
    },
    {
      filename,
      code: "import { Platform as P } from 'react-native'; P.select({});",
      errors: [{ messageId: 'flag' }],
    },
    {
      filename,
      code: "import { Platform } from 'react-native'; Platform['isTV'];",
      errors: [{ messageId: 'flag' }],
    },
    { filename: at('fixture.web.tsx'), code: 'export {};', errors: [{ messageId: 'twin' }] },
    { filename: at('fixture.ios.ts'), code: 'export {};', errors: [{ messageId: 'twin' }] },
  ],
});
