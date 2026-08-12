import { describe, expect, it } from 'vitest';
import { LOG_FORMAT, parseLog, parseStatus, splitPaths } from './git-history-parse.ts';

const NUL = '\0';
const MARK = '\x01';
const FIELD = '\x1f';

function logOf(...commits: { sha: string; date: string; subject: string; body: string }[]): string {
  return commits
    .map(
      (commit) =>
        `${MARK}${commit.sha}${FIELD}${commit.date}${FIELD}${commit.subject}${NUL}\n${commit.body}`,
    )
    .join('');
}

const BUTTON = 'packages/ui/src/components/atoms/button/button.tsx';
const STORY = 'packages/ui/src/components/atoms/button/button.stories.tsx';

describe('splitPaths', () => {
  it('reads a NUL-separated list without a trailing empty name', () => {
    expect(splitPaths(`${BUTTON}${NUL}${STORY}${NUL}`)).toEqual([BUTTON, STORY]);
  });
});

describe('parseStatus', () => {
  it('takes the name a staged rename came from as its earlier self', () => {
    const status = `R  ${STORY}${NUL}packages/ui/src/button.stories.tsx${NUL}`;
    const working = parseStatus(status);
    expect(working.renamedFrom.get(STORY)).toBe('packages/ui/src/button.stories.tsx');
    expect(working.dirty.has(STORY)).toBe(true);
  });

  it('counts an untracked file as an uncommitted change', () => {
    const working = parseStatus(`?? ${BUTTON}${NUL}`);
    expect(working.untracked).toEqual([BUTTON]);
    expect(working.dirty.has(BUTTON)).toBe(true);
  });

  it('does not read a rename’s original name as a status of its own', () => {
    const status = `R  ${STORY}${NUL}old.tsx${NUL}M  ${BUTTON}${NUL}`;
    const working = parseStatus(status);
    expect([...working.dirty]).toEqual([STORY, BUTTON]);
  });

  it('skips a record carrying a status and no path', () => {
    const working = parseStatus(`M  ${NUL}?? ${BUTTON}${NUL}`);
    expect([...working.dirty]).toEqual([BUTTON]);
  });

  it('leaves a rename whose original name never arrives without one', () => {
    const working = parseStatus(`R  ${STORY}`);
    expect(working.renamedFrom.size).toBe(0);
    expect(working.dirty.has(STORY)).toBe(true);
  });
});

describe('parseLog', () => {
  const output = logOf(
    {
      sha: 'aaa1111',
      date: '2026-08-11T10:00:00+02:00',
      subject: 'fix: a',
      body: `M${NUL}${BUTTON}${NUL}`,
    },
    {
      sha: 'bbb2222',
      date: '2026-07-01T10:00:00+02:00',
      subject: 'feat: b',
      body: `R100${NUL}packages/ui/src/button.tsx${NUL}${BUTTON}${NUL}A${NUL}${STORY}${NUL}`,
    },
  );

  it('reads each commit and the paths it touched, newest first', () => {
    const commits = parseLog(output);
    expect(commits.map((commit) => commit.sha)).toEqual(['aaa1111', 'bbb2222']);
    expect(commits[0]?.subject).toBe('fix: a');
    expect(commits[0]?.changes).toEqual([{ status: 'M', path: BUTTON }]);
  });

  it('reads a rename as the new path, remembering the old one', () => {
    const [, older] = parseLog(output);
    expect(older?.changes[0]).toEqual({
      status: 'R100',
      path: BUTTON,
      from: 'packages/ui/src/button.tsx',
    });
    expect(older?.changes[1]).toEqual({ status: 'A', path: STORY });
  });

  it('keeps a subject that carries the field separator itself', () => {
    const commits = parseLog(
      `${MARK}c0ffee1${FIELD}2026-08-01T00:00:00Z${FIELD}fix: a${FIELD}b${NUL}\nM${NUL}${BUTTON}${NUL}`,
    );
    expect(commits[0]?.subject).toBe(`fix: a${FIELD}b`);
  });

  it('reads no commit at all from records that precede the first header', () => {
    expect(parseLog(`M${NUL}${BUTTON}${NUL}`)).toEqual([]);
  });

  it('opens a commit on a header that stops after the sha', () => {
    const [commit] = parseLog(`${MARK}c0ffee1${NUL}\nM${NUL}${BUTTON}${NUL}`);
    expect(commit).toMatchObject({ sha: 'c0ffee1', date: '', subject: '' });
    expect(commit?.changes).toEqual([{ status: 'M', path: BUTTON }]);
  });

  it('drops a change whose path the output stops short of', () => {
    const cut = parseLog(`${MARK}c0ffee1${FIELD}2026-08-01T00:00:00Z${FIELD}fix: a${NUL}\nM`);
    expect(cut[0]?.changes).toEqual([]);
    const renamed = parseLog(
      `${MARK}c0ffee1${FIELD}2026-08-01T00:00:00Z${FIELD}fix: a${NUL}\nR100`,
    );
    expect(renamed[0]?.changes).toEqual([]);
  });

  it('names the format it reads', () => {
    expect(LOG_FORMAT).toBe(`--format=${MARK}%h${FIELD}%aI${FIELD}%s`);
  });
});
