import { GROUP_ORDER, slug } from '@kroma/workbench';
import { describe, expect, it } from 'vitest';
import { STORIES } from './stories';

const LOADED = await Promise.all(STORIES.map((entry) => entry.load()));

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

  it('documents what each component is for', () => {
    const undocumented = LOADED.filter((story) => !story.docs).map((story) => story.name);
    expect(undocumented).toEqual([]);
  });
});

// The index is what the sidebar lists before a single story module has been
// fetched, and it is read at BUILD time out of the same object literal the story
// constructs itself from. If the two ever disagree, the tree names one thing and
// the canvas draws another - so they are compared here, story by story.
describe('the index against the stories it fetches', () => {
  it('names and files every story exactly as its own module does', () => {
    const indexed = STORIES.map((entry) => `${entry.id} ${entry.name} ${entry.group}`);
    const own = LOADED.map((story) => `${story.id} ${story.name} ${story.group}`);
    expect(indexed).toEqual(own);
  });

  it('reads every story off a path the build also read, leaving none unfiled', () => {
    expect(STORIES.filter((entry) => entry.group === 'Other')).toEqual([]);
  });
});
