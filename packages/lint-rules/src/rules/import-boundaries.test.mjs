import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { RuleTester } from 'oxlint/plugins-dev';
import plugin from '../index.mjs';

RuleTester.describe = describe;
RuleTester.it = (name, fn) => it(name, fn);
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'tsx' } } });
const options = [
  {
    aliases: { '#web/': 'clients/web/src/', '#ui/': 'packages/ui/src/' },
    slices: ['clients/web/src/features'],
    ladders: [
      ['clients/web/src/shared', 'clients/web/src/features', 'clients/web/src/routes'],
      [
        'packages/ui/src/core/tokens',
        'packages/ui/src/components/atoms',
        'packages/ui/src/components/molecules',
      ],
    ],
  },
];
const at = (file, code) => ({ code, options, filename: join(root, file) });
const broken = (file, code, messageId) => ({ ...at(file, code), errors: [{ messageId }] });

tester.run('import-boundaries', plugin.rules['import-boundaries'], {
  valid: [
    at('clients/web/src/features/catalog/row.tsx', "import { api } from '#web/shared/lib/api';"),
    at('clients/web/src/features/catalog/row.tsx', "import { card } from './card';"),
    at('clients/web/src/features/catalog/list/row.tsx', "import { card } from '../card';"),
    at('clients/web/src/features/catalog/row.tsx', "import { Button } from '@kromatv/ui/kit';"),
    at('clients/web/src/routes/home.tsx', "import { Row } from '#web/features/catalog/row';"),
    at('clients/web/src/sw.ts', "import { Row } from '#web/features/catalog/row';"),
    at(
      'packages/ui/src/components/molecules/row/row.tsx',
      "import { Text } from '../../atoms/text';",
    ),
    at(
      'packages/ui/src/components/atoms/text/text.tsx',
      "import { colors } from '#ui/core/tokens';",
    ),
    at('packages/ui/src/components/atoms/text/text.tsx', "import { If } from '../../common/if';"),
    at('clients/web/src/features/catalog/row.tsx', 'const name = load(source);'),
    {
      code: "import { Player } from '../playback/player';",
      filename: join(root, 'clients/web/src/features/catalog/row.tsx'),
    },
  ],
  invalid: [
    broken(
      'clients/web/src/features/catalog/row.tsx',
      "import { Player } from '../playback/player';",
      'sibling',
    ),
    broken(
      'clients/web/src/features/catalog/list/row.tsx',
      "import type { Player } from '#web/features/playback/player';",
      'sibling',
    ),
    broken(
      'clients/web/src/features/catalog/row.tsx',
      "export { Player } from '../playback/player';",
      'sibling',
    ),
    broken(
      'clients/web/src/features/catalog/row.tsx',
      "export * from '../playback/player';",
      'sibling',
    ),
    broken(
      'clients/web/src/features/catalog/row.tsx',
      "const player = import('#web/features/playback/player');",
      'sibling',
    ),
    broken(
      'clients/web/src/shared/lib/api.ts',
      "import { admin } from '#web/features/admin/module-api';",
      'upward',
    ),
    broken(
      'clients/web/src/features/catalog/row.tsx',
      "import { Route } from '../../routes/home';",
      'upward',
    ),
    broken(
      'packages/ui/src/components/atoms/text/text.tsx',
      "import { Row } from '#ui/components/molecules/row';",
      'upward',
    ),
    broken(
      'packages/ui/src/core/tokens/colors.ts',
      "import { Text } from '../../components/atoms/text';",
      'upward',
    ),
  ],
});
