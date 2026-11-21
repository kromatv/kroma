import { describe, expect, it } from 'vitest';
import { measuredBy, measuredLanguages, unmeasuredAreas, unscoredFiles } from './coverage';

describe('measuredBy', () => {
  it('finds a record spelled from the repository root', () => {
    const measured = measuredBy(new Set(['packages/core/src/hevc.ts', 'vitest.config.ts']));

    expect(measured('packages/core/src/hevc.ts')).toBe(true);
    expect(measured('vitest.config.ts')).toBe(true);
  });

  it('finds a record spelled from a directory inside the repository', () => {
    const measured = measuredBy(new Set(['src/rules/zod-nonempty.mjs']));

    expect(measured('packages/lint-rules/src/rules/zod-nonempty.mjs')).toBe(true);
  });

  it('finds a record spelled from the root of another checkout', () => {
    const measured = measuredBy(new Set(['/home/runner/work/kroma/kroma/server/src/main.rs']));

    expect(measured('server/src/main.rs')).toBe(true);
    expect(measured('other-server/src/main.rs')).toBe(false);
  });

  it('does not take a bare file name for a match', () => {
    expect(measuredBy(new Set(['index.ts']))('packages/core/src/index.ts')).toBe(false);
  });

  it('is false for a file no record names', () => {
    expect(measuredBy(new Set(['server/src/lib.rs']))('server/src/main.rs')).toBe(false);
  });
});

describe('measuredLanguages', () => {
  it('names the languages with at least one measured source file', () => {
    const sources = ['packages/core/src/hevc.ts', 'server/src/main.rs', 'README.md'];
    const typescriptOnly = measuredBy(new Set(['packages/core/src/hevc.ts']));

    expect([...measuredLanguages(sources, typescriptOnly)]).toEqual(['typescript']);
    expect([...measuredLanguages(sources, measuredBy(new Set()))]).toEqual([]);
  });
});

describe('unmeasuredAreas', () => {
  const sources = [
    'clients/desktop/src-tauri/src/main.rs',
    'clients/desktop/src-tauri/src/mpv.rs',
    'clients/desktop/src/app.tsx',
    'packages/core/src/hevc.ts',
    'packages/core/src/lang.ts',
    'server/crates/kroma-db/src/lib.rs',
    'docs/notes.md',
  ];

  it('names an area where the language is measured elsewhere and here not at all', () => {
    const recorded = new Set(['server/crates/kroma-db/src/lib.rs', 'packages/core/src/hevc.ts']);

    expect(unmeasuredAreas(sources, measuredBy(recorded))).toEqual([
      { area: 'clients/desktop', language: 'rust', files: 2 },
      { area: 'clients/desktop', language: 'typescript', files: 1 },
    ]);
  });

  it('lists the area with the most files first, then by name', () => {
    const tied = ['apps/b/x.ts', 'apps/a/x.ts', 'apps/c/x.ts', 'apps/c/y.ts', 'packages/core/z.ts'];

    const areas = unmeasuredAreas(tied, measuredBy(new Set(['packages/core/z.ts'])));

    expect(areas.map((entry) => entry.area)).toEqual(['apps/c', 'apps/a', 'apps/b']);
  });

  it('leaves out a language no report covers at all', () => {
    const recorded = new Set(['packages/core/src/hevc.ts']);

    expect(unmeasuredAreas(sources, measuredBy(recorded))).toEqual([
      { area: 'clients/desktop', language: 'typescript', files: 1 },
    ]);
  });

  it('is empty when every area has a record, and when nothing is measured', () => {
    expect(
      unmeasuredAreas(
        ['packages/core/src/hevc.ts'],
        measuredBy(new Set(['packages/core/src/hevc.ts'])),
      ),
    ).toEqual([]);
    expect(unmeasuredAreas(sources, measuredBy(new Set()))).toEqual([]);
  });
});

describe('unscoredFiles', () => {
  const sources = [
    'packages/core/src/a.ts',
    'packages/core/src/new.ts',
    'packages/core/src/view.tsx',
    'clients/desktop/src-tauri/src/main.rs',
  ];
  const measured = measuredBy(new Set(['packages/core/src/a.ts']));

  it('scores a file with no record when a sibling of its kind is measured', () => {
    expect(unscoredFiles(['packages/core/src/new.ts'], sources, measured)).toEqual([]);
  });

  it('leaves out a kind of file no report holds, by extension and by area', () => {
    const judged = ['packages/core/src/view.tsx', 'clients/desktop/src-tauri/src/main.rs'];

    expect(unscoredFiles(judged, sources, measured)).toEqual(judged);
  });
});
