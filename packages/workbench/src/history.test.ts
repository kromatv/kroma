import { describe, expect, it } from 'vitest';
import {
  agoLabel,
  bucketOf,
  commitUrl,
  dayLabel,
  fileUrl,
  type HistoryEntry,
  type HistorySubject,
  historyOf,
  type KitHistory,
  recentChanges,
} from './history';

const SHA = 'c51eb485a1b2c3d4e5f60718293a4b5c6d7e8f90';
const REPO = 'https://github.com/maxscharwath/kroma';
const ROOT = 'packages/ui/src';

const BUTTON = `${ROOT}/components/atoms/button/button.stories.tsx`;
const PAGE = `${ROOT}/guides/02-tokens.page.mdx`;

const entry = (over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  created: '2026-07-27T16:35:46+02:00',
  changed: '2026-08-11T16:09:48+02:00',
  dirty: false,
  commits: [{ sha: '7f8d2169', date: '2026-08-11T16:09:48+02:00', subject: 'refactor: parts' }],
  ...over,
});

const history: KitHistory = {
  shallow: false,
  entries: { [BUTTON]: entry(), [PAGE]: entry({ created: undefined, changed: undefined }) },
};

describe('historyOf', () => {
  it('reads Vite’s glob key and Metro’s context key as the same file', () => {
    const vite = '../../packages/ui/src/components/atoms/button/button.stories.tsx';
    const metro = './components/atoms/button/button.stories.tsx';
    expect(historyOf(history, ROOT, vite)).toBe(history.entries[BUTTON]);
    expect(historyOf(history, ROOT, metro)).toBe(history.entries[BUTTON]);
  });

  it('says nothing where the build read no history at all', () => {
    expect(historyOf(undefined, ROOT, BUTTON)).toBeUndefined();
    expect(historyOf(history, ROOT, undefined)).toBeUndefined();
    expect(historyOf(history, ROOT, `${ROOT}/nothing/here.stories.tsx`)).toBeUndefined();
  });
});

describe('commitUrl', () => {
  it('links a commit at the remote the build named', () => {
    expect(commitUrl(REPO, '7f8d2169')).toBe(`${REPO}/commit/7f8d2169`);
    expect(commitUrl(`${REPO}/`, '7f8d2169')).toBe(`${REPO}/commit/7f8d2169`);
  });

  it('links nothing without a remote, or for something that is not a revision', () => {
    expect(commitUrl(null, '7f8d2169')).toBeNull();
    expect(commitUrl(REPO, 'main')).toBeNull();
  });

  it('refuses a remote the platform must not be handed', () => {
    expect(commitUrl('file:///Users/someone/kroma', '7f8d2169')).toBeNull();
  });
});

describe('fileUrl', () => {
  it('links the FILE, pinned to the revision the build came from', () => {
    expect(fileUrl(REPO, SHA, ROOT, '../../packages/ui/src/guides/02-tokens.page.mdx')).toBe(
      `${REPO}/blob/${SHA}/${PAGE}`,
    );
  });

  it('links nothing unpinned, rather than at whatever the branch drifted to', () => {
    expect(fileUrl(REPO, null, ROOT, PAGE)).toBeNull();
    expect(fileUrl(REPO, 'unknown', ROOT, PAGE)).toBeNull();
    expect(fileUrl(null, SHA, ROOT, PAGE)).toBeNull();
    expect(fileUrl(REPO, SHA, ROOT, undefined)).toBeNull();
  });
});

describe('dayLabel', () => {
  it('writes the month out, so no host words the same build differently', () => {
    expect(dayLabel('2026-08-11T16:09:48+02:00')).toMatch(/^11 Aug 2026$/);
  });

  it('is empty for a date there is none of', () => {
    expect(dayLabel(undefined)).toBe('');
    expect(dayLabel('not a date')).toBe('');
  });
});

describe('agoLabel', () => {
  const now = Date.parse('2026-08-11T12:00:00Z');
  const ago = (days: number) => agoLabel(new Date(now - days * 86_400_000).toISOString(), now);

  it('counts in the words a reader uses', () => {
    expect(ago(0)).toBe('today');
    expect(ago(1)).toBe('yesterday');
    expect(ago(4)).toBe('4 days ago');
    expect(ago(9)).toBe('last week');
    expect(ago(20)).toBe('2 weeks ago');
  });

  it('falls back to the date itself where "weeks ago" stops meaning anything', () => {
    expect(ago(60)).toBe(dayLabel(new Date(now - 60 * 86_400_000).toISOString()));
  });
});

describe('bucketOf', () => {
  const now = Date.parse('2026-08-11T12:00:00Z');
  const at = (days: number) =>
    bucketOf(entry({ changed: new Date(now - days * 86_400_000).toISOString() }), now);

  it('files a change under how long ago it was', () => {
    expect(at(0)).toBe('Today');
    expect(at(3)).toBe('This week');
    expect(at(20)).toBe('This month');
    expect(at(90)).toBe('Earlier');
  });

  it('files something never committed under its own heading', () => {
    expect(bucketOf(entry({ created: undefined, changed: undefined }), now)).toBe('Uncommitted');
  });
});

describe('recentChanges', () => {
  const subjects: HistorySubject[] = [
    { id: 'button', name: 'Button', group: 'Actions', page: false, path: BUTTON },
    { id: 'tokens', name: 'Tokens', group: 'Guides', page: true, path: PAGE },
    {
      id: 'ghost',
      name: 'Ghost',
      group: 'Actions',
      page: false,
      path: `${ROOT}/ghost.stories.tsx`,
    },
  ];

  it('puts what has no commits at all first, as the newest thing there is', () => {
    const rows = recentChanges(history, ROOT, subjects);
    expect(rows.map((row) => row.id)).toEqual(['tokens', 'button']);
  });

  it('leaves out a subject git has nothing to say about', () => {
    expect(recentChanges(history, ROOT, subjects).some((row) => row.id === 'ghost')).toBe(false);
  });

  it('is empty where the build read nothing', () => {
    expect(recentChanges(undefined, ROOT, subjects)).toEqual([]);
  });
});
