import { describe, expect, it } from 'vitest';
import { type Budget, budgetOf, drift, keyOf, serialize } from './budget';
import type { Measured } from './views';

type Allowance = readonly [nodes: number, depth: number, commits: number];

function view(id: string, viewName: string, [nodes, depth, commits]: Allowance): Measured {
  return {
    id,
    name: id,
    tier: 'atoms',
    file: `src/components/atoms/${id}/${id}.story.mdx`,
    view: viewName,
    cost: { nodes, leaves: 0, overhead: 0, depth, svg: 0, bytes: 0, smells: [] },
    signature: [],
    access: { lines: [], findings: [] },
    work: { commits, remounts: false },
  };
}

function broken(id: string, viewName: string, error: string): Measured {
  return { ...view(id, viewName, [0, 0, 0]), error };
}

const lines = (measured: readonly Measured[], budget: Budget) =>
  drift(measured, budget).map((verdict) => verdict.line);

describe('keyOf', () => {
  it('names a view by its story and the view within it, and only that way', () => {
    expect(keyOf(view('badge', 'preview', [4, 2, 1]))).toBe('badge/preview');
    expect(keyOf(view('badge', 'scene:Long label', [4, 2, 1]))).toBe('badge/scene:Long label');
  });
});

describe('budgetOf', () => {
  it('allows each view what it just cost: its nodes, its depth, then its mount commits', () => {
    expect(budgetOf([view('badge', 'preview', [6, 3, 2])])).toEqual({ 'badge/preview': [6, 3, 2] });
  });

  it('sorts by key, so the file it writes lands in the same order every time', () => {
    const out = budgetOf([
      view('zebra', 'preview', [1, 1, 1]),
      view('alphabet-rail', 'scene:One section', [2, 2, 1]),
      view('alphabet-rail', 'preview', [3, 3, 1]),
    ]);

    expect(Object.keys(out)).toEqual([
      'alphabet-rail/preview',
      'alphabet-rail/scene:One section',
      'zebra/preview',
    ]);
  });

  it('writes the budget these measurements hold to, so re-measuring reports nothing', () => {
    const measured = [view('badge', 'preview', [6, 3, 2]), view('rail', 'scene:One', [12, 4, 1])];

    expect(drift(measured, budgetOf(measured))).toEqual([]);
  });
});

describe('drift', () => {
  const budget: Budget = { 'badge/preview': [4, 2, 1] };

  it('says nothing about a view that costs exactly what it is allowed', () => {
    expect(drift([view('badge', 'preview', [4, 2, 1])], budget)).toEqual([]);
  });

  it('reads a view that grew, whether it grew in nodes, in depth or in commits', () => {
    expect(lines([view('badge', 'preview', [5, 2, 1])], budget)).toEqual([
      'badge/preview: grew to 5 nodes / depth 2 / 1 commits, budget is 4 / 2 / 1',
    ]);
    expect(lines([view('badge', 'preview', [4, 3, 1])], budget)[0]).toContain('grew to');
    expect(lines([view('badge', 'preview', [4, 2, 2])], budget)[0]).toContain('grew to');
  });

  it('reads a view that shrank as a budget left holding nothing to account', () => {
    expect(lines([view('badge', 'preview', [3, 2, 1])], budget)).toEqual([
      'badge/preview: down to 3 nodes / depth 2 / 1 commits, budget still says 4 / 2 / 1 - tighten it',
    ]);
    expect(lines([view('badge', 'preview', [4, 1, 1])], budget)[0]).toContain('tighten it');
    expect(
      lines([view('badge', 'preview', [4, 2, 1])], { 'badge/preview': [4, 2, 2] })[0],
    ).toContain('tighten it');
  });

  it('reads a view nothing has budgeted yet, and says what it would cost', () => {
    expect(lines([view('badge', 'preview', [4, 2, 1])], {})).toEqual([
      'badge/preview: not budgeted (4 nodes)',
    ]);
  });

  it('reads a budgeted view that is no longer in the kit', () => {
    expect(lines([], budget)).toEqual(['badge/preview: budgeted but no such view any more']);
  });

  it('reads a view that stopped rendering as a finding, not as one that shrank to nothing', () => {
    expect(lines([broken('badge', 'preview', 'render is not a function')], budget)).toEqual([
      'badge/preview: no longer renders - render is not a function',
    ]);
    expect(lines([broken('ghost', 'preview', 'boom')], {})).toEqual([
      'ghost/preview: no longer renders - boom',
    ]);
  });

  it('sorts what it found, so the report reads the same whatever order the kit mounted in', () => {
    const found = drift(
      [view('zebra', 'preview', [9, 2, 1]), view('alpha', 'preview', [9, 2, 1])],
      {
        'middle/preview': [1, 1, 1],
      },
    );

    expect(found.map((verdict) => verdict.key)).toEqual([
      'alpha/preview',
      'middle/preview',
      'zebra/preview',
    ]);
  });
});

describe('serialize', () => {
  it('writes one line per view, so a diff reads as a list of components that moved', () => {
    expect(serialize({ 'badge/preview': [4, 2, 1], 'badge/scene:Long label': [6, 3, 1] })).toBe(`{
  "badge/preview": [4, 2, 1],
  "badge/scene:Long label": [6, 3, 1]
}
`);
  });
});
