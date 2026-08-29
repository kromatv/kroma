import { describe, expect, it } from 'vitest';
import type { Check } from './check';
import { report } from './report';

const PASSED: Check = { name: 'focus ring at rest', reads: '1', ok: true };
const FAILED: Check = { name: 'console', reads: '3 errors', ok: false };

function lines(over: Partial<Parameters<typeof report>[0]> = {}): string[] {
  return report({
    origin: 'http://localhost:5179',
    destination: 'Films',
    presses: 24,
    items: 120,
    throttle: 6,
    verdicts: [PASSED, FAILED],
    complaints: [],
    ...over,
  });
}

describe('the report a run prints', () => {
  it('heads the run with where it ran and how hard', () => {
    expect(lines()[0]).toBe(
      '\n  http://localhost:5179   Films   24 presses   120 items   CPU /6\n',
    );
  });

  it('marks a passing check ok and a failing one FAIL, in one column', () => {
    expect(lines().slice(1, 3)).toEqual([
      '   ok   focus ring at rest       1',
      '  FAIL  console                  3 errors',
    ]);
  });

  it('counts repeated complaints instead of printing them again', () => {
    const noisy = lines({ complaints: ['a\n  warning', 'a warning', 'another'] });

    expect(noisy.slice(3, -1)).toEqual(['\n        2 x  a warning', '\n        1 x  another']);
  });

  it('prints no more than eight distinct complaints', () => {
    const flood = Array.from({ length: 12 }, (_, at) => `complaint ${at}`);

    expect(lines({ complaints: flood })).toHaveLength(12);
  });

  it('cuts a complaint that runs past a line', () => {
    const essay = 'x'.repeat(400);

    expect(lines({ complaints: [essay] }).at(-2)).toBe(`\n        1 x  ${'x'.repeat(150)}`);
  });
});
