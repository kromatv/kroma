import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { RuleTester } from 'oxlint/plugins-dev';
import rule from './no-physical-side.mjs';

RuleTester.describe = describe;
RuleTester.it = (name, fn) => it(name, fn);
const filename = fileURLToPath(
  new URL('../../../../packages/ui/src/components/atoms/fixture.tsx', import.meta.url),
);
const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'tsx' } } });
const side = [{ messageId: 'side' }];
const align = [{ messageId: 'align' }];
tester.run('no-physical-side', rule, {
  valid: [
    { filename, code: 'const s = styles({ lead: { ps: 12, me: 4 } });' },
    { filename, code: 'const s = styles({ lead: { paddingStart: 12, borderEndWidth: 1 } });' },
    { filename, code: "const n = <View style={{ position: 'absolute', start: 0, end: 8 }} />;" },
    { filename, code: "const s = styles({ label: { textAlign: 'end' } });" },
    { filename, code: 'const n = <View style={{ left: rect.left, top: rect.top }} />;' },
    { filename, code: 'const n = <View style={{ paddingLeft: Math.max(insets.left, 8) }} />;' },
    { filename, code: "const s = styles({ bar: { position: 'fixed', left: '50%' } });" },
    { filename, code: 'const n = <div style={{ left: 0, right: 0, bottom: 12 }} />;' },
    { filename, code: 'const s = styles({ left: { flex: 1 }, right: { flex: 2 } });' },
    { filename, code: 'const gutters = { left: 16, right: 16 + inset };' },
    { filename, code: 'const n = <Header left={<Back />} right={<Close />} />;' },
    { filename, code: 'const n = <Box start={12} ps={4} />;' },
    { filename, code: 'const room = { left: 52, bottom: 20 };' },
  ],
  invalid: [
    { filename, code: 'const s = styles({ lead: { paddingLeft: 12 } });', errors: side },
    { filename, code: 'const s = { marginRight: 4 };', errors: side },
    { filename, code: 'const s = style({ borderLeftWidth: 1 });', errors: side },
    { filename, code: 'const s = style({ borderTopRightRadius: 8 });', errors: side },
    {
      filename,
      code: "const n = <View style={{ position: 'absolute', right: 8 }} />;",
      errors: side,
    },
    {
      filename,
      code: 'const n = <View style={[base, open && { left: 12 }]} />;',
      errors: side,
    },
    { filename, code: 'const s = StyleSheet.create({ a: { left: 4 } });', errors: side },
    { filename, code: "const s = sharedStyle('k', { right: inset });", errors: side },
    { filename, code: 'const n = <Box pl={12} />;', errors: side },
    { filename, code: 'const n = <Box mr="auto" />;', errors: side },
    { filename, code: 'const n = <Box left={12} />;', errors: side },
    { filename, code: "const s = styles({ label: { textAlign: 'left' } });", errors: align },
    { filename, code: 'const n = <Text textAlign="right" />;', errors: align },
    {
      filename,
      code: 'const s = { paddingLeft: 8, paddingRight: 12 };',
      errors: [...side, ...side],
    },
  ],
});
