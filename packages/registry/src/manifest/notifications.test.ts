import { describe, expect, it } from 'vitest';
import { NotificationType, notificationsProblem } from './notifications.ts';
import { Manifest } from './v2.ts';

const completed = {
  type: 'tv.kroma.torrents/download.completed',
  category: 'downloads',
  titleKey: 'notifications.completed.title',
  bodyKey: 'notifications.completed.body',
};

describe('a declared notification type', () => {
  it('reads a type with its category and its keys', () => {
    const parsed = Manifest.parse({
      id: 'tv.kroma.torrents',
      name: 'Torrents',
      version: '1.0.0',
      notifications: [{ ...completed, push: false, labelKey: 'notifications.completed.label' }],
    });

    expect(parsed.notifications?.[0]?.push).toBe(false);
  });

  it('refuses a type with no namespace, a category the server lacks, and an empty key', () => {
    expect(() => NotificationType.parse({ ...completed, type: 'download.completed' })).toThrow();
    expect(() => NotificationType.parse({ ...completed, category: 'weather' })).toThrow();
    expect(() => NotificationType.parse({ ...completed, titleKey: '' })).toThrow();
  });
});

describe('notificationsProblem', () => {
  it('accepts types in the module’s own namespace', () => {
    expect(notificationsProblem('tv.kroma.torrents', [completed])).toBeNull();
  });

  it('names a type that only starts like the module’s id', () => {
    const stray = { type: 'tv.kroma.torrentsx/download.completed' };

    expect(notificationsProblem('tv.kroma.torrents', [stray])).toContain(
      'write tv.kroma.torrents/<name>',
    );
  });

  it('names a type declared twice', () => {
    expect(notificationsProblem('tv.kroma.torrents', [completed, completed])).toContain(
      'declared twice',
    );
  });
});
