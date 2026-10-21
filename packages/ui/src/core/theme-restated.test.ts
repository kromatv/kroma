import { describe, expect, it } from 'vitest';

import { collectSteps, restated, rulesOf } from './theme-restated';
import { createTheme, KROMA, type Theme } from './theme-create';

describe('collectSteps', () => {
  it('gathers each declared step under its token name once', () => {
    const found = new Map<string, string[]>();

    collectSteps(
      'a{--kroma-text-50:1;--kroma-text-50:2;--kroma-text-opaque:x;--kroma-text-alpha :y}',
      found,
    );

    expect(found.get('text')).toEqual(['50', 'opaque', 'alpha']);
  });

  it('accepts an underscored fractional step', () => {
    const found = new Map<string, string[]>();

    collectSteps('a{--kroma-bg-12_5:1}', found);

    expect(found.get('bg')).toEqual(['12_5']);
  });

  it('ignores foreign properties, reads without a declaration and unknown steps', () => {
    const found = new Map<string, string[]>();

    collectSteps('a{--other-x-50:1;color:var(--kroma-bg-50);--kroma-bg-big:1;--kroma-50:1}', found);

    expect(found.size).toBe(0);
  });
});

describe('rulesOf', () => {
  it('lists the rules of a readable sheet', () => {
    const sheet = {
      cssRules: [{ cssText: 'a{}' }, { cssText: 'b{}' }],
    } as unknown as CSSStyleSheet;

    expect(rulesOf(sheet)).toHaveLength(2);
  });

  it('skips a sheet that refuses to be read', () => {
    const sheet = {
      get cssRules(): never {
        throw new Error('SecurityError');
      },
    } as unknown as CSSStyleSheet;

    expect(rulesOf(sheet)).toEqual([]);
  });
});

describe('restated', () => {
  const theme = createTheme({
    colors: { text: '#112233' },
    radius: { md: 9 },
    shadow: { card: '0 1px 2px #000' },
    fonts: { sans: 'Inter' },
  } as never);

  const props = (steps = new Map<string, readonly string[]>()) =>
    Object.fromEntries(restated(theme, steps));

  it('writes a restated colour, radius, shadow and font', () => {
    const out = props();

    expect(out['--kroma-text']).toBe('#112233');
    expect(out['--radius-md']).toBe('9px');
    expect(out['--shadow-card']).toBe('0 1px 2px #000');
    expect(out['--font-sans']).toBeDefined();
  });

  it('derives opaque, alpha and numbered steps from a restated colour', () => {
    const out = props(new Map([['text', ['opaque', 'alpha', '50']]]));

    expect(out['--kroma-text-opaque']).toBeDefined();
    expect(out['--kroma-text-alpha']).toBeDefined();
    expect(out['--kroma-text-50']).toBeDefined();
  });

  it('writes a role the theme sized in px, with its spacing when it has one', () => {
    const sized = {
      ...KROMA,
      type: {
        body: {
          fontFamily: 'Inter',
          fontWeight: '500',
          fontSize: 17,
          lineHeight: 24,
          letterSpacing: 0.5,
        },
        title: { fontFamily: 'var(--f)', fontWeight: '700', fontSize: 30, lineHeight: 36 },
        fluid: { fontFamily: 'var(--f)', fontWeight: '700', fontSize: 'var(--s)', lineHeight: 36 },
      },
    } as unknown as Theme;

    const out = Object.fromEntries(restated(sized, new Map()));

    expect(out['--type-body-size']).toBe('17px');
    expect(out['--type-body-line']).toBe('24px');
    expect(out['--type-body-weight']).toBe('500');
    expect(out['--type-body-spacing']).toBe('0.5px');
    expect(out['--type-title-family']).toBe('var(--f)');
    expect(out['--type-title-spacing']).toBeUndefined();
    expect(out['--type-fluid-size']).toBeUndefined();
  });
});
