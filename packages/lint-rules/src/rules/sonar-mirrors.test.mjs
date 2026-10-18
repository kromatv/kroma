import { describe, it } from 'node:test';
import { RuleTester } from 'oxlint/plugins-dev';
import plugin from '../index.mjs';

RuleTester.describe = describe;
RuleTester.it = (name, fn) => it(name, fn);
const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'tsx' } } });

tester.run('re-export-from', plugin.rules['re-export-from'], {
  valid: [
    "export { clamp } from './math';",
    "import { clamp } from './math'; export const unit = clamp(2); export { clamp };",
    "import type { Theme } from './theme'; export function paint(theme: Theme) { return theme; } export type { Theme };",
    "import { Box, type BoxProps } from './box'; export function Card(props: BoxProps) { return Box(props); } export type { BoxProps };",
    'const local = 1; export { local };',
    "import clamp from './math'; export default clamp;",
  ],
  invalid: [
    {
      code: "import { clamp } from './math'; export { clamp };",
      errors: [{ messageId: 'reExport' }],
    },
    {
      code: "import { Box, type BoxProps } from './box'; export const Card = Box; export type { BoxProps };",
      errors: [{ messageId: 'reExport' }],
    },
    {
      code: "import { a, b } from './pair'; export { a, b as c };",
      errors: [{ messageId: 'reExport' }, { messageId: 'reExport' }],
    },
  ],
});

tester.run('use-state-pair', plugin.rules['use-state-pair'], {
  valid: [
    "const [tab, setTab] = useState('all');",
    'const [isOpen, setIsOpen] = React.useState(false);',
    'const [slide] = useState(() => new Animated.Value(1));',
    'const [{ x }, setPoint] = useState({ x: 0 });',
    'const value = useMemo(() => 1, []);',
    'const [state, dispatch] = useReducer(reduce, 0);',
  ],
  invalid: [
    { code: "const [chosen, setTab] = useState('all');", errors: [{ messageId: 'asymmetric' }] },
    { code: 'const state = useState(0);', errors: [{ messageId: 'notDestructured' }] },
    { code: 'const [count, update] = React.useState(0);', errors: [{ messageId: 'asymmetric' }] },
  ],
});
