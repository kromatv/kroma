import { describe, expect, it } from 'vitest';
import { asLiteral } from './as-literal';

describe('asLiteral', () => {
  it('writes a value that fits on one line the way a console prints it', () => {
    const row = { ref: 'c1', state: { value: 4 }, actions: ['setValue', 'mute'] };

    const text = asLiteral(row);

    expect(text).toBe("{ ref: 'c1', state: { value: 4 }, actions: ['setValue', 'mute'] }");
  });

  it('gives each entry its own line when the value is too wide for one', () => {
    const row = {
      ref: 'c1',
      kind: 'volume',
      state: { value: 4 },
      actions: ['setValue', 'louder', 'quieter', 'mute'],
    };

    const text = asLiteral(row);

    expect(text).toBe(
      [
        '{',
        "  ref: 'c1',",
        "  kind: 'volume',",
        '  state: { value: 4 },',
        "  actions: ['setValue', 'louder', 'quieter', 'mute'],",
        '}',
      ].join('\n'),
    );
  });

  it('lays out only the entries that are too wide, at any depth', () => {
    const report = {
      ok: true,
      controls: [{ ref: 'c1', actions: ['setValue', 'louder', 'quieter', 'mute'] }],
    };

    const text = asLiteral(report);

    expect(text).toBe(
      [
        '{',
        '  ok: true,',
        '  controls: [',
        "    { ref: 'c1', actions: ['setValue', 'louder', 'quieter', 'mute'] },",
        '  ],',
        '}',
      ].join('\n'),
    );
  });

  it('breaks a string too long for its line between two words', () => {
    const message = 'c1.press: the volume has no such action. It takes: setValue, louder, mute.';

    const text = asLiteral({ message });

    expect(text).toBe(
      [
        '{',
        "  message: 'c1.press: the volume has no such action. It takes: ' +",
        "    'setValue, louder, mute.',",
        '}',
      ].join('\n'),
    );
  });

  it('quotes a key that is not a name and escapes a quote in a string', () => {
    const text = asLiteral({ 'aria-label': "the volume's name" });

    expect(text).toBe(String.raw`{ 'aria-label': 'the volume\'s name' }`);
  });

  it('leaves out a key that holds nothing', () => {
    const text = asLiteral({ ok: false, error: undefined, steps: [], box: null });

    expect(text).toBe('{ ok: false, steps: [], box: null }');
  });
});
