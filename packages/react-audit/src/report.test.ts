import { describe, expect, it } from 'vitest';
import type { Commit } from './analyse';
import type { Result } from './record';
import { formatResult } from './report';

const result = (fields: Partial<Result>): Result => ({
  commits: [] as readonly Commit[],
  churn: [],
  rerenders: 0,
  components: [],
  elements: [],
  elementCount: 0,
  ...fields,
});

describe('a result as a person reads it', () => {
  it('opens with the four totals, whatever else it has to say', () => {
    const clean = result({ commits: [{}, {}] as unknown as readonly Commit[], elementCount: 42 });

    expect(formatResult(clean)).toBe('2 commits  42 elements  0 churned  0 re-rendered');
  });

  it('adds the churned fibers up rather than counting the components they came from', () => {
    const churned = result({
      churn: [
        ['Tile', 6],
        ['Row', 3],
      ],
    });

    expect(formatResult(churned).split('\n')[0]).toContain('9 churned');
  });

  it('lists what was destroyed and rebuilt, count first and right-aligned', () => {
    const churned = result({ churn: [['Tile', 6]] });

    expect(formatResult(churned)).toBe(
      [
        '0 commits  0 elements  6 churned  0 re-rendered',
        '',
        'destroyed and rebuilt:',
        '      6  Tile',
      ].join('\n'),
    );
  });

  it('leaves out a component that only mounted, since nothing re-rendered', () => {
    const mounted = result({ components: [['Tile', { mounted: 4, updated: 0 }]] });

    expect(formatResult(mounted)).not.toContain('re-rendered:');
  });

  it('lists only the components that re-rendered', () => {
    const mixed = result({
      components: [
        ['Rail', { mounted: 0, updated: 9 }],
        ['Tile', { mounted: 4, updated: 0 }],
      ],
    });

    expect(formatResult(mixed)).toContain('      9  Rail');
    expect(formatResult(mixed)).not.toContain('Tile');
  });

  it('stops at the limit rather than printing every offender', () => {
    const many = result({
      churn: Array.from({ length: 20 }, (_, i) => [`C${i}`, 20 - i] as const),
    });

    expect(formatResult(many, 3).split('\n')).toHaveLength(6);
  });
});
