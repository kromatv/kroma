import { describe, expect, it } from 'vitest';
import {
  attribute,
  entriesOf,
  groupFiles,
  type HistoryCommit,
  LOG_FORMAT,
  type LogCommit,
  parseLog,
  parseStatus,
  splitPaths,
} from './git-history-parse.ts';

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

  it('names the format it reads', () => {
    expect(LOG_FORMAT).toBe(`--format=${MARK}%h${FIELD}%aI${FIELD}%s`);
  });
});

describe('attribute', () => {
  const commit = (sha: string, date: string, changes: LogCommit['changes']): LogCommit => ({
    sha,
    date,
    subject: sha,
    changes,
  });

  it('follows a rename into the file’s earlier life', () => {
    const commits = [
      commit('c333', '2026-08-10T00:00:00Z', [{ status: 'M', path: BUTTON }]),
      commit('c222', '2026-08-02T00:00:00Z', [
        { status: 'R100', path: BUTTON, from: 'packages/ui/src/button.tsx' },
      ]),
      commit('c111', '2026-07-01T00:00:00Z', [{ status: 'A', path: 'packages/ui/src/button.tsx' }]),
    ];
    const found = attribute(commits, new Map([[BUTTON, BUTTON]]));
    expect(found.get(BUTTON)?.map((entry) => entry.sha)).toEqual(['c333', 'c222', 'c111']);
  });

  it('follows a move that is only staged, before it is a commit at all', () => {
    const commits = [
      commit('c111', '2026-07-01T00:00:00Z', [{ status: 'A', path: 'packages/ui/src/old.tsx' }]),
    ];
    const moved = 'packages/ui/src/new/new.tsx';
    const found = attribute(commits, new Map([[moved, 'packages/ui/src/old.tsx']]));
    expect(found.get(moved)?.map((entry) => entry.sha)).toEqual(['c111']);
  });

  it('says nothing about a path no commit ever held', () => {
    const commits = [commit('c111', '2026-07-01T00:00:00Z', [{ status: 'M', path: BUTTON }])];
    expect(attribute(commits, new Map([[STORY, STORY]])).get(STORY)).toBeUndefined();
  });
});

describe('groupFiles', () => {
  it('gives a component its whole folder, keyed by its story', () => {
    const folder = 'packages/ui/src/components/atoms/button';
    const files = [
      `${folder}/button.tsx`,
      `${folder}/button.test.tsx`,
      `${folder}/index.ts`,
      STORY,
    ];
    expect(groupFiles(files).get(STORY)?.sort()).toEqual(files.sort());
  });

  it('attaches a nested helper to the nearest story above it', () => {
    const player = 'packages/ui/src/components/organisms/player';
    const files = [
      `${player}/player.stories.tsx`,
      `${player}/hooks/use-controls.ts`,
      `${player}/parts/top-bar/top-bar.stories.tsx`,
      `${player}/parts/top-bar/top-bar.tsx`,
    ];
    const groups = groupFiles(files);
    expect(groups.get(`${player}/player.stories.tsx`)).toEqual([
      `${player}/player.stories.tsx`,
      `${player}/hooks/use-controls.ts`,
    ]);
    expect(groups.get(`${player}/parts/top-bar/top-bar.stories.tsx`)).toEqual([
      `${player}/parts/top-bar/top-bar.stories.tsx`,
      `${player}/parts/top-bar/top-bar.tsx`,
    ]);
  });

  it('splits a folder holding several stories by file name', () => {
    const root = 'packages/ui/src/foundations';
    const files = [
      `${root}/colors.stories.tsx`,
      `${root}/colors.test.ts`,
      `${root}/typography.stories.tsx`,
      `${root}/shared.ts`,
    ];
    const groups = groupFiles(files);
    expect(groups.get(`${root}/colors.stories.tsx`)).toEqual([
      `${root}/colors.stories.tsx`,
      `${root}/colors.test.ts`,
    ]);
    expect(groups.get(`${root}/typography.stories.tsx`)).toEqual([
      `${root}/typography.stories.tsx`,
    ]);
    expect([...groups.values()].flat()).not.toContain(`${root}/shared.ts`);
  });

  it('keys an article by its own file, never by the folder it shares', () => {
    const files = [
      'packages/ui/src/guides/01-tokens.page.mdx',
      'packages/ui/src/guides/02-icons.page.mdx',
    ];
    const groups = groupFiles(files);
    expect(groups.get(files[0] as string)).toEqual([files[0]]);
    expect(groups.get(files[1] as string)).toEqual([files[1]]);
  });
});

describe('entriesOf', () => {
  const commits = (...list: HistoryCommit[]) => list;
  const older: HistoryCommit = { sha: 'c111', date: '2026-07-01T00:00:00Z', subject: 'born' };
  const newer: HistoryCommit = { sha: 'c222', date: '2026-08-01T00:00:00Z', subject: 'grew' };

  it('dates a component from its whole folder, oldest commit first written', () => {
    const groups = new Map([[STORY, [STORY, BUTTON]]]);
    const found = new Map([
      [STORY, commits(newer)],
      [BUTTON, commits(older)],
    ]);
    const entry = entriesOf(groups, found, new Set(), 6)[STORY];
    expect(entry?.created).toBe(older.date);
    expect(entry?.changed).toBe(newer.date);
    expect(entry?.commits.map((commit) => commit.sha)).toEqual(['c222', 'c111']);
  });

  it('lists a commit touching two of a component’s files once', () => {
    const groups = new Map([[STORY, [STORY, BUTTON]]]);
    const found = new Map([
      [STORY, commits(newer)],
      [BUTTON, commits(newer, older)],
    ]);
    expect(entriesOf(groups, found, new Set(), 6)[STORY]?.commits).toHaveLength(2);
  });

  it('bounds the listed commits without moving the creation date', () => {
    const many = Array.from({ length: 10 }, (_, at) => ({
      sha: `c${at}`,
      date: `2026-0${at % 9}-01T00:00:00Z`.replace('0-0', '1-0'),
      subject: 'x',
    }));
    const entry = entriesOf(new Map([[STORY, [STORY]]]), new Map([[STORY, many]]), new Set(), 3)[
      STORY
    ];
    expect(entry?.commits).toHaveLength(3);
    expect(entry?.created).toBe('2026-01-01T00:00:00Z');
  });

  it('marks an entry whose files carry uncommitted edits', () => {
    const entry = entriesOf(
      new Map([[STORY, [STORY, BUTTON]]]),
      new Map([[STORY, commits(newer)]]),
      new Set([BUTTON]),
      6,
    )[STORY];
    expect(entry?.dirty).toBe(true);
  });

  it('keeps something never committed as having no history, rather than none at all', () => {
    const entry = entriesOf(new Map([[STORY, [STORY]]]), new Map(), new Set([STORY]), 6)[STORY];
    expect(entry).toEqual({ dirty: true, commits: [] });
  });

  it('says nothing about a group git has never seen and nobody has touched', () => {
    expect(entriesOf(new Map([[STORY, [STORY]]]), new Map(), new Set(), 6)).toEqual({});
  });
});
