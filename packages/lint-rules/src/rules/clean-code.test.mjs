import { describe, it } from 'node:test';
import { RuleTester } from 'oxlint/plugins-dev';
import plugin from '../index.mjs';

RuleTester.describe = describe;
RuleTester.it = (name, fn) => it(name, fn);
const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'tsx' } } });

tester.run('no-boolean-flag-param', plugin.rules['no-boolean-flag-param'], {
  valid: [
    'function render({ compact }: { compact: boolean }) {}',
    'function setOpen(open: boolean) {}',
    'const onToggle = (next: boolean) => {};',
    'function handleChange(checked: boolean) {}',
    'const withBorder = (bordered: boolean) => ({});',
    'items.filter((visible: boolean) => visible);',
    '<Switch onValueChange={(next: boolean) => save(next)} />;',
    'function count(total: number, label: string) {}',
    'function pick(value: boolean | string) {}',
    'class Store { constructor(private readonly strict: boolean) {} }',
    'function read([first]: boolean[]) {}',
    'function load(depth = 1) {}',
  ],
  invalid: [
    'function render(compact: boolean) {}',
    'const load = (force = false) => {};',
    'const api = { refresh(silent?: boolean) {} };',
    'class Store { reset(hard: boolean | undefined) {} }',
    'const save = function (draft: boolean | null) {};',
    'class Panel { toggleable = (open = true) => {}; }',
  ].map((code) => ({ code, errors: [{ messageId: 'flag' }] })),
});

tester.run('zod-nonempty', plugin.rules['zod-nonempty'], {
  valid: [
    'const name = z.string().nonempty();',
    'const name = z.string().min(2);',
    'const tags = z.array(z.string()).min(1);',
    'const count = z.number().min(1);',
    'const name = other.string().min(1);',
    'const name = schema.min(1);',
    'const name = z.string()["min"](1);',
    'const name = z.string().min(limit);',
  ],
  invalid: [
    {
      code: 'const name = z.string().min(1);',
      output: 'const name = z.string().nonempty();',
      errors: [{ messageId: 'nonempty' }],
    },
    {
      code: "const name = z.string().trim().min(1, 'required').max(64);",
      output: "const name = z.string().trim().nonempty('required').max(64);",
      errors: [{ messageId: 'nonempty' }],
    },
  ],
});
