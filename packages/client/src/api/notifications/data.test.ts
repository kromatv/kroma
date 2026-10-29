import { describe, expect, it } from 'vitest';
import { notificationData } from './data';
import type { Notification } from './schemas';

const row = (event: string, data?: Record<string, unknown>): Notification =>
  ({
    id: 'n1',
    category: 'requests',
    event,
    title: 't',
    body: 'b',
    data,
    actions: [],
    read: false,
    createdAt: 0,
  }) as unknown as Notification;

describe('notificationData', () => {
  it("reads a request's facts against the schema its event names", () => {
    const one = row('request.available', {
      requestId: 'req-7',
      kind: 'movie',
      tmdbId: 438631,
      status: 'available',
    });

    expect(notificationData(one)).toEqual({
      requestId: 'req-7',
      kind: 'movie',
      tmdbId: 438631,
      status: 'available',
    });
  });

  it('leaves a season drop without the numbers a single episode carries', () => {
    const one = row('media.episode', { showId: 'shw', count: 4 });

    expect(notificationData(one)).toEqual({ showId: 'shw', count: 4 });
  });

  it('ignores the data of an event this client has never heard of', () => {
    const one = row('tv.kroma.torrents/download.stalled', { torrent: 'abc' });

    expect(notificationData(one)).toBeUndefined();
  });

  it('drops a payload that does not match rather than passing it on half-read', () => {
    const one = row('system.job.failed', { job: 'library.scan' });

    expect(notificationData(one)).toBeUndefined();
  });

  it('has nothing to read on a row written before the server sent data', () => {
    expect(notificationData(row('request.approved'))).toBeUndefined();
  });
});
