import { GROUP_ORDER, slug } from '@kroma/workbench';
import { describe, expect, it } from 'vitest';
import { STORIES } from './stories';

// Fetching every story module is the expensive part here, and only two of the
// tests below need it. At module scope it ran during COLLECTION, against the
// 10s hook budget rather than a test's own: on a loaded runner the file timed
// out before a single assertion ran. Memoised, so the two still share one load.
let pending: ReturnType<typeof loadAll> | null = null;
const loadAll = () => Promise.all(STORIES.map((entry) => entry.load()));
const loaded = () => {
  pending ??= loadAll();
  return pending;
};

// Long enough for a cold runner to fetch a hundred modules, and it is one wait
// for the pair.
const LOAD_MS = 60_000;

describe('the story registry', () => {
  it('is not empty', () => {
    expect(STORIES.length).toBeGreaterThan(20);
  });

  it('gives every story a unique id', () => {
    const ids = STORIES.map((story) => story.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('derives every id from its name', () => {
    for (const story of STORIES) expect(story.id).toBe(slug(story.name));
  });

  it('only uses groups the sidebar knows how to order', () => {
    const unknown = [...new Set(STORIES.map((story) => story.group))].filter(
      (group) => !GROUP_ORDER.includes(group),
    );
    expect(unknown).toEqual([]);
  });

  it(
    'documents what each component is for',
    async () => {
      const undocumented = (await loaded()).filter((s) => !s.docs).map((s) => s.name);
      expect(undocumented).toEqual([]);
    },
    LOAD_MS,
  );
});

// The index is what the sidebar lists before a single story module has been
// fetched, and it is read at BUILD time out of the same object literal the story
// constructs itself from. If the two ever disagree, the tree names one thing and
// the canvas draws another - so they are compared here, story by story.
describe('the index against the stories it fetches', () => {
  it(
    'names and files every story exactly as its own module does',
    async () => {
      const indexed = STORIES.map((entry) => `${entry.id} ${entry.name} ${entry.group}`);
      const own = (await loaded()).map((s) => `${s.id} ${s.name} ${s.group}`);
      expect(indexed).toEqual(own);
    },
    LOAD_MS,
  );

  it('reads every story off a path the build also read, leaving none unfiled', () => {
    expect(STORIES.filter((entry) => entry.group === 'Other')).toEqual([]);
  });
});
