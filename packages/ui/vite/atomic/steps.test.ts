import { beforeAll, describe, expect, it } from 'vitest';
import { Unstatic } from './module-scope.ts';
import { compileSteps } from './steps.ts';
import { resolveAsBrowser } from './web-theme.ts';

beforeAll(() => resolveAsBrowser());

describe('compileSteps', () => {
  it('passes a layer that names no breakpoint through untouched', () => {
    const base = { opacity: 0.5 };
    expect(compileSteps([base])).toEqual({ values: base, rules: [] });
  });

  it('folds a longhand stated per step into one class and one rule per further step', () => {
    const { values, rules } = compileSteps([
      { lineHeight: 20 },
      { lineHeight: 20 },
      { lineHeight: 24 },
    ]);
    expect(values.lineHeight).toMatch(/^var\(--k[\w-]+,20px\)$/);
    expect(rules).toHaveLength(1);
    expect(rules[0]?.css).toMatch(
      /^:root\[data-kroma-bp~="lg"\] \.[a-d][\w-]{5}\{--k[\w-]+:24px;\}$/,
    );
  });

  it('refuses a step whose value is not a string or a number', () => {
    expect(() =>
      compileSteps([{ transform: [{ scale: 1 }] }, { transform: [{ scale: 2 }] }]),
    ).toThrow(/a transform stated per breakpoint as object/);
    expect(() => compileSteps([{ x: true }, { x: false }])).toThrow(Unstatic);
  });

  it('refuses a longhand whose compiled form is not the value written into it', () => {
    expect(() => compileSteps([{ fontFamily: 'System' }, { fontFamily: 'monospace' }])).toThrow(
      /a fontFamily stated per breakpoint/,
    );
    expect(() => compileSteps([{ position: 'relative' }, { position: 'sticky' }])).toThrow(
      /a position stated per breakpoint/,
    );
  });
});
