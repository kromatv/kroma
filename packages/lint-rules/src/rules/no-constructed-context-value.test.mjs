import { describe, it } from 'node:test';
import { RuleTester } from 'oxlint/plugins-dev';
import rule from './no-constructed-context-value.mjs';

RuleTester.describe = describe;
RuleTester.it = (name, fn) => it(name, fn);
const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'tsx' } } });
const built = [{ messageId: 'built' }];
tester.run('no-constructed-context-value', rule, {
  valid: [
    "import { RowContext } from './row'; const A = () => <RowContext value={held}>{kids}</RowContext>;",
    "import { RowContext } from './row'; const A = () => <RowContext value={useMemo(() => ({ go }), [go])}>{kids}</RowContext>;",
    "import { RowContext } from './row'; function A() { const row = String(at); return <RowContext value={row}>{kids}</RowContext>; }",
    'const A = () => <Slider value={[low, high]} />;',
    'const A = () => <TextField value={{ text }} />;',
    'const Ctx = createContext(null); const A = () => <Ctx value={{ go }}>{kids}</Ctx>;',
    "import { RowContext } from './row'; const A = () => <RowContext.Provider value={{ go }}>{kids}</RowContext.Provider>;",
    "import { RowContext } from './row'; const held = { go }; const A = () => <RowContext value={held}>{kids}</RowContext>;",
    "import { RowContext } from './row'; const held = { go }; const A = () => { const held = [go]; return held; }; const B = () => <RowContext value={held}>{kids}</RowContext>;",
    "import { RowContext } from './row'; function A() { const a = b; const b = a; return <RowContext value={a}>{kids}</RowContext>; }",
    "import { RowContext } from './row'; function A() { const { row } = { row: held }; return <RowContext value={row}>{kids}</RowContext>; }",
  ],
  invalid: [
    {
      code: "import { RowContext } from './row'; const A = () => <RowContext value={{ go }}>{kids}</RowContext>;",
      errors: built,
    },
    {
      code: "import { CastCtx } from './cast'; const A = () => <CastCtx value={() => go()}>{kids}</CastCtx>;",
      errors: built,
    },
    {
      code: "const [Part, usePart] = partContext('A.Root'); const A = () => <Part value={[go]}>{kids}</Part>;",
      errors: built,
    },
    {
      code: "import { RowContext } from './row'; function A() { const row = { go }; return <RowContext value={row}>{kids}</RowContext>; }",
      errors: built,
    },
    {
      code: "import { RowContext } from './row'; function A() { const row = { go }; const same = row; return <RowContext value={same}>{kids}</RowContext>; }",
      errors: built,
    },
    {
      code: "import { RowContext } from './row'; function A() { const row = [go]; return list.map((kid) => <RowContext value={row}>{kid}</RowContext>); }",
      errors: built,
    },
    {
      code: "import { RowContext } from './row'; const A = () => <RowContext value={on ? { go } : null}>{kids}</RowContext>;",
      errors: built,
    },
    {
      code: "import { RowContext } from './row'; const A = () => <RowContext value={row(at)}>{kids}</RowContext>;",
      errors: built,
    },
  ],
});
