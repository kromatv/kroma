import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RuleTester } from 'oxlint/plugins-dev';
import rule, { paletteNames } from './no-unresolved-color-tokens.mjs';

RuleTester.describe = describe;
RuleTester.it = (name, fn) => it(name, fn);
const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'tsx' } } });
const reported = (code, ...tokens) => ({
  code,
  errors: tokens.map((token) => ({ messageId: 'unresolved', data: { token } })),
});

tester.run('no-unresolved-color-tokens', rule, {
  valid: [
    "const node = <div style={{ background: color('bg') }} />;",
    "const node = <div style={{ background: '#0A0A0C', color: 'white' }} />;",
    "const node = <div style={{ mixBlendMode: 'overlay', backgroundClip: 'text' }} />;",
    "const node = <div style={{ background: 'url(data:image/svg+xml;utf8,<svg fill=accent/>)' }} />;",
    "const node = <div style={{ background: 'linear-gradient(red, blue) text' }} />;",
    'const node = <div className="accent" title=\'bg\' />;',
    "const node = <Box bg='accent' style={{ backgroundColor: color('bg') }} />;",
    "const node = <Text color='text/52' />;",
    "const s = styles({ root: { bg: 'accent', color: 'text/52' } });",
    "const style = { background: 'bg' }; const node = <Box style={style} />;",
    "const node = <path fill={tokenColor('text')} stroke='none' />;",
    'const node = <div style={{ boxShadow: `0 0 0 2px ${accent}` }} />;',
    "let base = { background: 'bg' }; const node = <div style={base} />;",
    'const node = <div style={s.root} />;',
    "import { Path } from '#ui/components/atoms/path'; const node = <Path fill='accent' />;",
    "canvas.fillStyle = color('accent');",
    "element.style.transform = 'accent';",
    "element.style.setProperty('--accent', 'accent');",
    "const tones: Tone[] = [{ background: 'accent' }];",
  ],
  invalid: [
    reported("const node = <div style={{ background: 'bg' }} />;", 'bg'),
    reported("const node = <div style={{ color: 'text/52' }} />;", 'text/52'),
    reported("const node = <div style={{ border: '2px solid accent' }} />;", 'accent'),
    reported(
      'const node = <div style={{ boxShadow: `0 0 0 2px accentWash/50` }} />;',
      'accentWash/50',
    ),
    reported(
      'const node = <div style={{ boxShadow: `0 0 ${blur}px accentWash, 0 0 1px text` }} />;',
      'accentWash',
    ),
    reported("const node = <div style={{ background: on ? 'accent' : '#000' }} />;", 'accent'),
    reported("const node = <div style={{ background: tone ?? 'surface2' }} />;", 'surface2'),
    reported("const node = <div style={{ ['background-color']: 'surface1' }} />;", 'surface1'),
    reported("const node = <div style={{ background: 'bg' as const }} />;", 'bg'),
    reported(
      "const SHADE = { background: 'bg' }; const node = <div style={{ ...SHADE, opacity: 1 }} />;",
      'bg',
    ),
    reported("const SHADE = { background: 'bg' }; const node = <div style={SHADE} />;", 'bg'),
    reported("const node = <div style={[{ backgroundColor: 'bg' }]} />;", 'bg'),
    reported("const node = <path fill='text' />;", 'text'),
    reported("const node = <stop stopColor='accent/40' />;", 'accent/40'),
    reported("const node = <svg:rect fill='accent' />;", 'accent'),
    reported("import { Path } from '#ui/lib/svg'; const node = <Path fill='accent' />;", 'accent'),
    reported(
      "import { Circle } from '#ui/lib/svg.component'; const node = <Circle stroke={`accent`} />;",
      'accent',
    ),
    reported(
      "import { Line } from 'react-native-svg'; const node = <Line stroke='text/18' />;",
      'text/18',
    ),
    reported(
      "import { View } from 'react-native'; const node = <View style={{ backgroundColor: 'bg' }} />;",
      'bg',
    ),
    reported(
      "import { Animated } from 'react-native'; const node = <Animated.View style={{ borderColor: 'border' }} />;",
      'border',
    ),
    reported(
      "import { TextInput } from 'react-native'; const node = <TextInput placeholderTextColor='textDim' />;",
      'textDim',
    ),
    reported(
      "import type { CSSProperties } from 'react'; const EMBERS: ReadonlyArray<CSSProperties & { anim: string }> = [{ background: 'accentBright', anim: 'a' }];",
      'accentBright',
    ),
    reported(
      "const PANES: Record<string, React.CSSProperties> = { a: { color: 'textMuted' } };",
      'textMuted',
    ),
    reported("const pane = { outlineColor: 'accent' } satisfies CSSProperties;", 'accent'),
    reported(
      "const SHADE: CSSProperties = { background: 'bg' }; const node = <div style={SHADE} />;",
      'bg',
    ),
    reported("canvas.fillStyle = 'accent';", 'accent'),
    reported("context.strokeStyle = 'tint/40';", 'tint/40'),
    reported("element.style.background = 'bg';", 'bg'),
    reported("element.style.setProperty('border-color', 'border');", 'border'),
  ],
});

describe('paletteNames', () => {
  it('reads every name of the kit palette and none of the light palette', () => {
    const names = paletteNames();

    assert.ok(['bg', 'text', 'accent', 'accentBright', 'accentPale'].every((n) => names.has(n)));
    assert.equal(names.has('lightColors'), false);
  });

  it('refuses a palette it cannot read rather than checking nothing', () => {
    assert.throws(() => paletteNames('export const palette = {};'), /no colour token found/);
  });
});
