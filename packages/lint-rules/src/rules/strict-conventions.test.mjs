import { describe, it } from 'node:test';
import { RuleTester } from 'oxlint/plugins-dev';
import plugin from '../index.mjs';

RuleTester.describe = describe;
RuleTester.it = it;
const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'tsx' } } });
function run(name, valid, invalid) {
  tester.run(name, plugin.rules[name], {
    valid,
    invalid: invalid.map((example) => ({
      ...(typeof example === 'string' ? { code: example } : example),
      errors: [{ messageId: 'violation' }],
    })),
  });
}
run(
  'index-reexports-only',
  [
    { filename: '/app/index.ts', code: "export { thing } from './thing';" },
    { filename: '/app/index.tsx', code: "export type { Props } from './props';" },
    {
      filename: '/app/index.ts',
      code: "export * from './thing'; export * as other from './other';",
    },
    { filename: '/app/index.ts', code: "export { default } from './thing';" },
    { filename: '/app/index.ts', code: '// A public entry point.\n;' },
    { filename: '/app/thing.ts', code: 'export const value = 1;' },
    { filename: '/app/index.test.ts', code: 'const value = 1;' },
  ],
  [
    { filename: '/app/index.ts', code: 'export const value = 1;' },
    { filename: '/app/index.tsx', code: 'export default function App() { return <div />; }' },
    { filename: '/app/index.ts', code: "import './install';" },
    { filename: '/app/index.ts', code: 'export type Props = { name: string };' },
    { filename: '/app/index.ts', code: 'export {};' },
    { filename: '/app/index.ts', code: 'install();' },
  ],
);
run(
  'no-nested-templates',
  [
    `const inner = \`user \${name}\`; const outer = \`hello \${inner}\`;`,
    `const text = \`hello \${() => \`user \${name}\`}\`;`,
    `const text = html\`<span>\${\`user \${name}\`}</span>\`;`,
    `const text = \`hello \${sql\`select \${name}\`}\`;`,
    `const a = \`first \${name}\`; const b = \`second \${name}\`;`,
  ],
  [
    `const text = \`hello \${\`user \${name}\`}\`;`,
    `const text = \`hello \${ok ? \`user \${name}\` : fallback}\`;`,
    `const text = \`hello \${format(\`user \${name}\`)}\`;`,
  ],
);
run(
  'owned-task-comments',
  [
    '// TODO(maxsch): remove fallback after #123\nconst value = 1;',
    '// FIXME(@platform/team): restore focus\nconst value = 1;',
    '/**\n * TODO(platform-team): remove legacy adapter\n */\nconst value = 1;',
    '// The TODO syntax requires ownership.\nconst value = 1;',
    "const text = 'TODO: external input';",
  ],
  [
    '// TODO: fix this\nconst value = 1;',
    '// FIXME\nconst value = 1;',
    '// TODO(): fix this\nconst value = 1;',
    '// TODO(owner): fix this\nconst value = 1;',
    '// TODO(maxsch):\nconst value = 1;',
    '/**\n * FIXME(unknown): restore focus\n */\nconst value = 1;',
  ],
);
run(
  'no-redundant-jsdoc-tags',
  [
    {
      filename: '/app/value.ts',
      code: '/** Empty input returns an empty list. */\nexport function parse(value: string) {}',
    },
    {
      filename: '/app/value.ts',
      code: '/**\n * @deprecated Use parse instead.\n */\nexport function old() {}',
    },
    { filename: '/app/value.js', code: '/** @type {string} */\nconst name = "name";' },
    { filename: '/app/value.ts', code: '// @param is redundant in TypeScript.\nconst value = 1;' },
    {
      filename: '/app/value.ts',
      code: '/** The @param spelling is discussed here. */\nconst value = 1;',
    },
  ],
  [
    {
      filename: '/app/value.ts',
      code: '/** @param value The value. */\nexport function parse(value: string) {}',
    },
    {
      filename: '/app/value.tsx',
      code: '/**\n * @returns The element.\n */\nexport function App() { return <div />; }',
    },
    { filename: '/app/value.mts', code: '/** @return The value. */\nexport function value() {}' },
    { filename: '/app/value.cts', code: '/** @type {string} */\nconst value = "name";' },
  ],
);
run(
  'no-unknown-record-assertions',
  [
    'const value: Record<string, unknown> = known;',
    'const value = known satisfies Record<string, unknown>;',
    'const value = schema.safeParse(input);',
    'const value = known as Record<string, string>;',
    'const value = known as Record<number, unknown>;',
    'const value = known as Namespace.Record<string, unknown>;',
  ],
  [
    'const value = input as Record<string, unknown>;',
    'const value = input as unknown as Record<string, unknown>;',
  ],
);
const tsTester = new RuleTester({ languageOptions: { parserOptions: { lang: 'ts' } } });
tsTester.run(
  'no-unknown-record-assertions-angle-brackets',
  plugin.rules['no-unknown-record-assertions'],
  {
    valid: ['const value = <Record<string, string>>input;'],
    invalid: [
      {
        code: 'const value = <Record<string, unknown>>input;',
        errors: [{ messageId: 'violation' }],
      },
    ],
  },
);
const emDash = String.fromCodePoint(0x2014);
run(
  'no-em-dashes',
  [
    'const text = "Start: end";',
    '// Start, then end.\nconst value = 1;',
    `const pattern = /${emDash}/;`,
    `const text = \`start: \${name}\`;`,
  ],
  [
    `const text = "Start ${emDash} end";`,
    `// Start ${emDash} end\nconst value = 1;`,
    `const text = <span>Start ${emDash} end</span>;`,
    `const text = <span title="Start ${emDash} end" />;`,
    `const text = \`Start ${emDash} \${name}\`;`,
    'const text = "Start \\u2014 end";',
  ],
);
run(
  'no-raw-design-values',
  [
    "const style = { color: 'textDim', radius: 'md' };",
    "const style = { color: 'transparent', borderRadius: 0, width: 100 };",
    "const node = <Box bg='surface2' radius='md' />;",
    'const style = { color: palette.text, fontSize: typeRole.size };',
    "const style = { borderRadius: '0px' };",
    "const id = '#ffffff';",
    "const labels = { fontSize: 'Font size' };",
    "const style = { color: 'var(--accent)' };",
    "const style = { ['color' + suffix]: '#fff' };",
    'const style = { color() { return "token"; } };',
  ],
  [
    "const style = { color: '#fff' };",
    "const style = { backgroundColor: 'rgba(0, 0, 0, 0.4)' };",
    "const style = { ['borderColor']: '#aabbccdd' };",
    'const style = { borderRadius: 8 };',
    'const style = { fontSize: -12 };',
    'const style = { color: `#ffffff` };',
    "const node = <Box bg='#ffffff' />;",
    'const node = <Text fontSize={14} />;',
    'const node = <Box radius="8px" />;',
  ],
);
