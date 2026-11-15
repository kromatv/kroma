import { describe, expect, it } from 'vitest';
import type { CrapEntry, CrapReport, CrapSummary, ScoredEntry } from './crap';
import type { DryReport } from './dry';
import { renderCrap, renderDry, renderSummary } from './summary';

const scored = (name: string, crap: number): ScoredEntry => ({
  name,
  namespace: 'app|route',
  complexity: 12,
  coverage: 40,
  crap,
});

const summary = (worst: ScoredEntry[], mostComplex: CrapEntry[]): CrapSummary => ({
  functions: 120,
  atLeast10: 9,
  atLeast30: 2,
  uncovered: 31,
  worst,
  worstTested: worst,
  mostComplex,
});

const PARSE_EPISODE: CrapEntry = {
  name: 'parse_episode',
  namespace: 'kroma_scene::parse',
  complexity: 12,
  coverage: null,
  crap: null,
};

const CRAP: CrapReport = {
  languages: [
    { language: 'typescript', scored: true, summary: summary([scored('ShowDetail', 43.104)], []) },
    { language: 'rust', scored: false, summary: summary([], [PARSE_EPISODE]) },
  ],
  unmeasured: [{ area: 'clients/desktop', language: 'typescript', files: 26 }],
  coverageReports: ['coverage/lcov.info'],
};

const DRY: DryReport = {
  threshold: 0.8,
  summary: {
    production: 14,
    test: 3,
    exact: 5,
    crossFile: 11,
    clusters: 6,
    largestClusters: [
      {
        forms: [
          { file: 'a.rs', start: 1, end: 9 },
          { file: 'b.rs', start: 4, end: 12 },
        ],
        lines: 18,
      },
      { forms: [], lines: 0 },
    ],
    largestPairs: [
      {
        score: 0.9,
        language: 'rust',
        left: { file: 'a.rs', start: 1, end: 9 },
        right: { file: 'b.rs', start: 4, end: 12 },
      },
    ],
  },
};

describe('renderCrap', () => {
  const text = renderCrap(CRAP);

  it('leads with the counts of a scored language', () => {
    expect(text).toContain('Coverage read from `coverage/lcov.info`.');
    expect(text).toContain('| TypeScript | 120 | 9 | 2 | 31 |');
  });

  it('shows no CRAP for a language no coverage report holds, and says why', () => {
    expect(text).toContain('| Rust | 120 | n/a | n/a | n/a |');
    expect(text).toContain('### Most complex functions, Rust');
    expect(text).toContain('so Rust is scored on complexity alone.');
    expect(text).toContain('| 12 | `kroma_scene::parse::parse_episode` |');
  });

  it('names the areas that read 0% because nothing measures them', () => {
    expect(text).toContain('### Read as 0% because nothing measures them');
    expect(text).toContain('| `clients/desktop` | TypeScript | 26 |');
  });

  it('lists the worst functions with their score, complexity and coverage', () => {
    expect(text).toContain('### Worst functions, TypeScript');
    expect(text).toContain('### Worst functions a test reaches, TypeScript');
    expect(text).toContain('| 43.1 | 12 | 40.0% | `app\\|route::ShowDetail` |');
  });

  it('says so when no coverage report was found, and drops the empty section', () => {
    const bare = renderCrap({ languages: [], unmeasured: [], coverageReports: [] });

    expect(bare).toContain('No coverage report was found.');
    expect(bare).not.toContain('Read as 0%');
  });
});

describe('renderDry', () => {
  const text = renderDry(DRY);

  it('counts production pairs apart from the ones with test code', () => {
    expect(text).toContain('score 0.8 or above');
    expect(text).toContain('| 14 | 5 | 11 | 6 | 3 |');
  });

  it('lists the largest pairs and clusters, and where every pair is', () => {
    expect(text).toContain('| 0.90 | rust | `a.rs:1-9` | `b.rs:4-12` |');
    expect(text).toContain('| 2 | 18 | `a.rs:1-9` |');
    expect(text).toContain('| 0 | 0 |  |');
    expect(text).toContain('`.metrics/dry-production.tsv`');
  });
});

describe('renderSummary', () => {
  it('holds both halves under one title', () => {
    const text = renderSummary({ ok: true, value: CRAP }, { ok: true, value: DRY });

    expect(text.startsWith('# Code quality report\n')).toBe(true);
    expect(text).toContain('A report, not a gate');
    expect(text).toContain('## CRAP');
    expect(text).toContain('## Duplication');
  });

  it('keeps the half that worked when the other failed, and says why it failed', () => {
    const text = renderSummary(
      { ok: false, reason: 'crapper exited 1 on rust: boom' },
      { ok: true, value: DRY },
    );

    expect(text).toContain('## CRAP\n\nNot produced: crapper exited 1 on rust: boom');
    expect(text).toContain('| 14 | 5 | 11 | 6 | 3 |');
  });

  it('says so for the duplication half too', () => {
    const text = renderSummary({ ok: true, value: CRAP }, { ok: false, reason: 'no dryer' });

    expect(text).toContain('## Duplication\n\nNot produced: no dryer');
    expect(text).toContain('### Worst functions, TypeScript');
  });
});
