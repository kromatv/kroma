import type { NotificationPrefs } from '@kromatv/client/notifications';
import { describe, expect, it } from 'vitest';
import {
  categorySwitched,
  channelReach,
  prefsSections,
  sectionSwitched,
  typeSwitched,
} from './notification-prefs';

const jobFailed = {
  type: 'system.job.failed',
  category: 'system' as const,
  label: 'Task failed',
  inApp: true,
  push: true,
};

const completed = {
  type: 'tv.kroma.torrents/download.completed',
  category: 'downloads' as const,
  label: 'Finished downloads',
  inApp: true,
  push: false,
};

const prefs: NotificationPrefs = {
  categories: [
    { category: 'downloads', inApp: true, push: true },
    { category: 'system', inApp: true, push: true },
  ],
  types: [jobFailed, completed],
};

describe('prefsSections', () => {
  it('follows each category with its own kinds, in the order the server sent them', () => {
    const sections = prefsSections(prefs);

    expect(sections.map((s) => s.category.category)).toEqual(['downloads', 'system']);
    expect(sections[0]?.types).toEqual([completed]);
    expect(sections[1]?.types).toEqual([jobFailed]);
  });

  it('leaves a category with no kinds of its own with an empty list', () => {
    const sections = prefsSections({ ...prefs, types: [] });

    expect(sections.every((s) => s.types.length === 0)).toBe(true);
  });
});

describe('the update a switch sends', () => {
  it('names the one category that moved', () => {
    expect(
      categorySwitched({ category: 'system', inApp: true, push: true }, { push: false }),
    ).toEqual({ categories: [{ category: 'system', inApp: true, push: false }] });
  });

  it('carries both switches of the kind that moved, and nothing else about it', () => {
    expect(typeSwitched(jobFailed, { inApp: false })).toEqual({
      types: [{ type: 'system.job.failed', inApp: false, push: true }],
    });
  });
});

describe('a category as the sum of its kinds', () => {
  const downloads = {
    category: { category: 'downloads' as const, inApp: true, push: true },
    types: [completed, { ...completed, type: 'download.failed', push: true }],
  };

  it('counts the kinds a channel reaches', () => {
    expect(channelReach(downloads, 'inApp')).toEqual({ on: 2, of: 2 });
    expect(channelReach(downloads, 'push')).toEqual({ on: 1, of: 2 });
  });

  it('counts a category with no kinds as its own switch', () => {
    const bare = { category: { category: 'system' as const, inApp: false, push: true }, types: [] };

    expect(channelReach(bare, 'inApp')).toEqual({ on: 0, of: 1 });
    expect(channelReach(bare, 'push')).toEqual({ on: 1, of: 1 });
  });

  it('moves the category and every kind under it on the one channel switched', () => {
    expect(sectionSwitched(downloads, 'push', false)).toEqual({
      categories: [{ category: 'downloads', inApp: true, push: false }],
      types: [
        { type: completed.type, inApp: true, push: false },
        { type: 'download.failed', inApp: true, push: false },
      ],
    });
  });
});
