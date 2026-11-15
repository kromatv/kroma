import { describe, expect, it } from 'vitest';
import { type CrapEntry, parseCrapSnapshot, type ScoredEntry, summarizeCrap } from './crap';

const scored = (name: string, complexity: number, coverage: number): ScoredEntry => ({
  name,
  namespace: 'demo',
  complexity,
  coverage,
  crap: complexity ** 2 * (1 - coverage / 100) ** 3 + complexity,
});

const complexityOnly = (name: string, complexity: number): CrapEntry => ({
  name,
  namespace: 'demo',
  complexity,
  coverage: null,
  crap: null,
});

describe('parseCrapSnapshot', () => {
  it('reads the entries crapper writes', () => {
    const edn = [
      '{:entries [',
      '  {:name "ProfilePin", :namespace "app.(app).profile-pin", :complexity 48, :coverage 0.0, :crap 2352.0}',
      '  {:name "walk", :namespace "progress-queue.queue", :complexity 7, :coverage 87.5, :crap 7.0957}',
      ']}',
    ].join('\n');

    expect(parseCrapSnapshot(edn)).toEqual([
      {
        name: 'ProfilePin',
        namespace: 'app.(app).profile-pin',
        complexity: 48,
        coverage: 0,
        crap: 2352,
      },
      {
        name: 'walk',
        namespace: 'progress-queue.queue',
        complexity: 7,
        coverage: 87.5,
        crap: 7.0957,
      },
    ]);
  });

  it('reads a complexity-only run, where coverage and CRAP are nil', () => {
    const edn =
      '{:entries [\n  {:name "f", :namespace "c::m", :complexity 4, :coverage nil, :crap nil}\n]}';

    expect(parseCrapSnapshot(edn)).toEqual([
      { name: 'f', namespace: 'c::m', complexity: 4, coverage: null, crap: null },
    ]);
  });

  it('reads an empty snapshot', () => {
    expect(parseCrapSnapshot('{:entries []}\n')).toEqual([]);
  });

  it('rejects a snapshot of another shape', () => {
    expect(() => parseCrapSnapshot('{:candidates []}')).toThrow();
    expect(() => parseCrapSnapshot('{:entries [{:name "f"}]}')).toThrow();
  });

  it('rejects an entry with a score and no coverage', () => {
    const edn = '{:entries [{:name "f", :namespace "m", :complexity 4, :coverage nil, :crap 4.0}]}';

    expect(() => parseCrapSnapshot(edn)).toThrow();
  });
});

describe('summarizeCrap', () => {
  const entries = [
    scored('covered', 10, 100),
    scored('untested', 3, 0),
    scored('tangled', 30, 100),
    scored('risky', 6, 50),
    scored('worst', 12, 0),
  ];

  it('counts a function that sits exactly on a threshold', () => {
    const summary = summarizeCrap([...entries, scored('five untested branches', 5, 0)], 10);

    expect(summary.functions).toBe(6);
    expect(summary.atLeast10).toBe(6);
    expect(summary.atLeast30).toBe(3);
    expect(summary.uncovered).toBe(3);
  });

  it('ranks the worst first, and can leave out what no test reaches', () => {
    const summary = summarizeCrap(entries, 3);

    expect(summary.worst.map((e) => e.name)).toEqual(['worst', 'tangled', 'untested']);
    expect(summary.worstTested.map((e) => e.name)).toEqual(['tangled', 'risky', 'covered']);
    expect(summary.mostComplex.map((e) => e.name)).toEqual(['tangled', 'worst', 'covered']);
  });

  it('breaks a tie by name, so two runs print the same table', () => {
    const tied = [scored('b', 4, 100), scored('a', 4, 100)];

    expect(summarizeCrap(tied, 5).worst.map((e) => e.name)).toEqual(['a', 'b']);
    expect(summarizeCrap(tied, 5).mostComplex.map((e) => e.name)).toEqual(['a', 'b']);
  });

  it('scores nothing in a complexity-only run, and still ranks by complexity', () => {
    const summary = summarizeCrap([complexityOnly('small', 2), complexityOnly('large', 40)], 5);

    expect(summary).toMatchObject({ functions: 2, atLeast10: 0, atLeast30: 0, uncovered: 0 });
    expect(summary.worst).toEqual([]);
    expect(summary.worstTested).toEqual([]);
    expect(summary.mostComplex.map((e) => e.name)).toEqual(['large', 'small']);
  });
});
