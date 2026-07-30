// Stories are picked up by a glob, so nothing else would notice an unsortable
// group name or two components that slug to the same id.

import { GROUP_ORDER, slug } from '@kroma/workbench';
import { describe, expect, it } from 'vitest';
import { STORIES } from './stories';

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
    const undocumented = STORIES.filter((story) => !story.docs).map((story) => story.name);
    expect(undocumented).toEqual([]);
  });
});
