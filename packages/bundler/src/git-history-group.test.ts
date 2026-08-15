import { describe, expect, it } from 'vitest';
import {
  attribute,
  entriesOf,
  groupFiles,
  type HistoryCommit,
  type LogCommit,
} from './git-history-parse.ts';

const BUTTON = 'packages/ui/src/components/atoms/button/button.tsx';
const STORY = 'packages/ui/src/components/atoms/button/button.story.mdx';
const OLD_BUTTON = 'packages/ui/src/button.tsx';

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
      commit('c222', '2026-08-02T00:00:00Z', [{ status: 'R100', path: BUTTON, from: OLD_BUTTON }]),
      commit('c111', '2026-07-01T00:00:00Z', [{ status: 'A', path: OLD_BUTTON }]),
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

  it('gives a staged copy and its original the same earlier history', () => {
    const copy = 'packages/ui/src/components/atoms/button/button-tone.tsx';
    const commits = [commit('c111', '2026-07-01T00:00:00Z', [{ status: 'A', path: BUTTON }])];
    const found = attribute(
      commits,
      new Map([
        [BUTTON, BUTTON],
        [copy, BUTTON],
      ]),
    );
    expect(found.get(BUTTON)?.map((entry) => entry.sha)).toEqual(['c111']);
    expect(found.get(copy)?.map((entry) => entry.sha)).toEqual(['c111']);
  });

  it('keeps both histories where a name is used again after a rename away from it', () => {
    const commits = [
      commit('c333', '2026-08-10T00:00:00Z', [{ status: 'A', path: OLD_BUTTON }]),
      commit('c222', '2026-08-02T00:00:00Z', [{ status: 'R100', path: BUTTON, from: OLD_BUTTON }]),
      commit('c111', '2026-07-01T00:00:00Z', [{ status: 'A', path: OLD_BUTTON }]),
    ];
    const found = attribute(
      commits,
      new Map([
        [BUTTON, BUTTON],
        [OLD_BUTTON, OLD_BUTTON],
      ]),
    );
    expect(found.get(BUTTON)?.map((entry) => entry.sha)).toEqual(['c222', 'c111']);
    expect(found.get(OLD_BUTTON)?.map((entry) => entry.sha)).toEqual(['c333', 'c111']);
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
      `${player}/player.story.mdx`,
      `${player}/hooks/use-controls.ts`,
      `${player}/parts/top-bar/top-bar.story.mdx`,
      `${player}/parts/top-bar/top-bar.tsx`,
    ];
    const groups = groupFiles(files);
    expect(groups.get(`${player}/player.story.mdx`)).toEqual([
      `${player}/player.story.mdx`,
      `${player}/hooks/use-controls.ts`,
    ]);
    expect(groups.get(`${player}/parts/top-bar/top-bar.story.mdx`)).toEqual([
      `${player}/parts/top-bar/top-bar.story.mdx`,
      `${player}/parts/top-bar/top-bar.tsx`,
    ]);
  });

  it('splits a folder holding several stories by file name', () => {
    const root = 'packages/ui/src/foundations';
    const files = [
      `${root}/colors.story.mdx`,
      `${root}/colors.test.ts`,
      `${root}/typography.story.mdx`,
      `${root}/shared.ts`,
    ];
    const groups = groupFiles(files);
    expect(groups.get(`${root}/colors.story.mdx`)).toEqual([
      `${root}/colors.story.mdx`,
      `${root}/colors.test.ts`,
    ]);
    expect(groups.get(`${root}/typography.story.mdx`)).toEqual([`${root}/typography.story.mdx`]);
    expect([...groups.values()].flat()).not.toContain(`${root}/shared.ts`);
  });

  it('leaves a file with no story anywhere above it out of every group', () => {
    const groups = groupFiles([STORY, 'packages/ui/src/index.ts', 'README.md']);
    expect([...groups.values()].flat()).toEqual([STORY]);
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

  it('keys the entries by path, whatever order the groups arrived in', () => {
    const at = (name: string) => `packages/ui/src/components/atoms/${name}.story.mdx`;
    const groups = new Map(['chip', 'avatar', 'button'].map((name) => [at(name), [at(name)]]));
    const found = new Map([...groups.keys()].map((key) => [key, commits(newer)]));
    expect(Object.keys(entriesOf(groups, found, new Set(), 6))).toEqual([
      at('avatar'),
      at('button'),
      at('chip'),
    ]);
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
