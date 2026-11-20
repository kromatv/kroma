import { describe, expect, it } from 'vitest';
import { addedFile, parseDiff, touches } from './changes';

const DIFF = [
  'diff --git a/server/src/a.rs b/server/src/a.rs',
  'index 1111111..2222222 100644',
  '--- a/server/src/a.rs',
  '+++ b/server/src/a.rs',
  '@@ -10,2 +10,3 @@ fn before() {',
  '-old',
  '+new',
  '@@ -40 +41 @@',
  '+one',
  '@@ -60,4 +60,0 @@',
  '-gone',
  'diff --git a/packages/core/src/b.ts b/packages/core/src/b.ts',
  'new file mode 100644',
  '--- /dev/null',
  '+++ b/packages/core/src/b.ts',
  '@@ -0,0 +1,12 @@',
  '+export const b = 1;',
].join('\n');

describe('parseDiff', () => {
  it('reads the lines a modified file adds or rewrites, and none for a hunk that only deletes', () => {
    const [modified] = parseDiff(DIFF);

    expect(modified).toEqual({
      file: 'server/src/a.rs',
      added: false,
      lines: [
        { start: 10, end: 12 },
        { start: 41, end: 41 },
      ],
    });
  });

  it('marks a file the diff creates as added', () => {
    const [, created] = parseDiff(DIFF);

    expect(created).toEqual({
      file: 'packages/core/src/b.ts',
      added: true,
      lines: [{ start: 1, end: 12 }],
    });
  });

  it('finds no file in an empty diff', () => {
    expect(parseDiff('')).toEqual([]);
  });
});

describe('touches', () => {
  const [modified] = parseDiff(DIFF);

  it.each([
    [{ start: 1, end: 10 }, true],
    [{ start: 12, end: 20 }, true],
    [{ start: 13, end: 40 }, false],
    [{ start: 60, end: 63 }, false],
  ])('says whether a changed line is inside %o', (span, expected) => {
    expect(modified === undefined ? undefined : touches(modified, span)).toBe(expected);
  });

  it('counts every line of an untracked file as changed', () => {
    expect(touches(addedFile('new.rs'), { start: 900, end: 910 })).toBe(true);
  });
});
