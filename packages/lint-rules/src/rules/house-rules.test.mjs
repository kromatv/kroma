import { describe, it } from 'node:test';
import { RuleTester } from 'oxlint/plugins-dev';
import plugin from '../index.mjs';

RuleTester.describe = describe;
RuleTester.it = it;
const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'tsx' } } });
function run(name, valid, invalid, messageId) {
  tester.run(name, plugin.rules[name], {
    valid,
    invalid: invalid.map((code) => ({ code, errors: [{ messageId }] })),
  });
}
run(
  'no-module-mutable-bindings',
  [
    'const retryLimit = 3;',
    'export const retryLimit = 3;',
    'function create() { let value = 0; return () => ++value; }',
    'declare let external: string;',
  ],
  [
    'let value = 0;',
    'var value = 0;',
    'export let value = 0;',
    'export var value = 0;',
    'let { value } = source;',
  ],
  'mutable',
);
run(
  'no-react-forward-ref',
  [
    "import { memo } from 'react';",
    "import { forwardRef } from 'another-library';",
    'const React = { forwardRef() {} }; React.forwardRef();',
    "import * as React from 'react'; function render(React: any) { React.forwardRef(); }",
    "import type { Ref } from 'react'; function Input({ ref }: { ref?: Ref<HTMLInputElement> }) { return <input ref={ref} />; }",
  ],
  [
    "import { forwardRef } from 'react';",
    "import { forwardRef as wrap } from 'react';",
    "export { forwardRef as wrap } from 'react';",
    "import * as React from 'react'; React.forwardRef(render);",
    "import R from 'react'; R.forwardRef(render);",
    "import * as R from 'react'; R['forwardRef'](render);",
  ],
  'forwardRef',
);
run(
  'no-comment-banners',
  [
    '// Tizen rejects ranges past EOF; clamp before sending.\nconst value = 1;',
    "const label = '// ---- helpers ----';",
    '/** Returns a value only after the native bridge connects. */\nconst value = 1;',
    '// A hyphenated-word is ordinary prose.\nconst value = 1;',
  ],
  [
    '// ---- helpers ----\nconst value = 1;',
    '// === STATE ===\nconst value = 1;',
    '// ========\nconst value = 1;',
    '/**\n * ---- helpers ----\n */\nconst value = 1;',
  ],
  'banner',
);
