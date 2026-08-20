import { describe, expect, it, vi } from 'vitest';
import { fetchAt, load } from '#web/sw.fixture';

describe('notificationclick', () => {
  const clickEvent = (over: Record<string, unknown> = {}) => {
    const close = vi.fn();
    return {
      event: {
        action: undefined,
        notification: { close, data: { link: '/movie/ab12', actions: [] } },
        ...over,
      },
      close,
    };
  };

  it('opens the linked page and dismisses the notification', async () => {
    const sw = load();
    const { event, close } = clickEvent();
    await sw.fire('notificationclick', event);

    expect(close).toHaveBeenCalled();
    expect(sw.opened).toEqual(['https://kroma.test/movie/ab12']);
  });

  it('reuses a tab that is already open on this origin', async () => {
    const sw = load([{ url: 'https://kroma.test/library' }]);
    await sw.fire('notificationclick', clickEvent().event);

    expect(sw.opened).toEqual([]);
    expect(sw.focused).toBe(1);
    expect(sw.navigated).toEqual(['https://kroma.test/movie/ab12']);
  });

  it('ignores a tab on another origin', async () => {
    const sw = load([{ url: 'https://elsewhere.test/' }]);
    await sw.fire('notificationclick', clickEvent().event);
    expect(sw.opened).toEqual(['https://kroma.test/movie/ab12']);
    expect(sw.focused).toBe(0);
  });

  it('still focuses a tab that cannot be navigated', async () => {
    // Some browsers reject navigate().
    const sw = load([
      {
        url: 'https://kroma.test/library',
        navigate: async () => {
          throw new Error('not supported');
        },
      },
    ]);
    await sw.fire('notificationclick', clickEvent().event);
    expect(sw.focused).toBe(1);
    expect(sw.opened).toEqual([]);
  });

  it('calls the server directly for an api action without opening the app', async () => {
    const sw = load();
    const { event } = clickEvent({
      action: 'approve',
      notification: {
        close: vi.fn(),
        data: {
          link: '/requests',
          actions: [
            { id: 'approve', kind: 'api', href: '/api/requests/r1/approve', method: 'POST' },
          ],
        },
      },
    });
    await sw.fire('notificationclick', event);

    expect(sw.fetches).toHaveLength(1);
    expect(fetchAt(sw, 0).url).toBe('/api/requests/r1/approve');
    expect(fetchAt(sw, 0).init).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(sw.opened).toEqual([]);
  });

  it('refuses to send credentials to an api action on another origin', async () => {
    const sw = load();
    const { event } = clickEvent({
      action: 'approve',
      notification: {
        close: vi.fn(),
        data: {
          link: '/requests',
          actions: [{ id: 'approve', kind: 'api', href: 'https://elsewhere.test/steal' }],
        },
      },
    });
    await sw.fire('notificationclick', event);

    expect(sw.fetches).toEqual([]);
    expect(sw.opened).toEqual(['https://kroma.test/requests']);
  });

  it('falls back to this origin when the link points at another one', async () => {
    const sw = load();
    const { event } = clickEvent({
      notification: { close: vi.fn(), data: { link: 'https://elsewhere.test/', actions: [] } },
    });
    await sw.fire('notificationclick', event);

    expect(sw.opened).toEqual(['https://kroma.test']);
  });

  it('opens the app when an api action fails, so the user can act by hand', async () => {
    const sw = load();
    sw.setFetch(async () => {
      throw new Error('offline');
    });
    const { event } = clickEvent({
      action: 'approve',
      notification: {
        close: vi.fn(),
        data: {
          link: '/requests',
          actions: [{ id: 'approve', kind: 'api', href: '/api/requests/r1/approve' }],
        },
      },
    });
    await sw.fire('notificationclick', event);

    expect(sw.opened).toEqual(['https://kroma.test/requests']);
  });

  it('navigates to a link action rather than the notification body link', async () => {
    const sw = load();
    const { event } = clickEvent({
      action: 'watch',
      notification: {
        close: vi.fn(),
        data: {
          link: '/requests',
          actions: [{ id: 'watch', kind: 'link', href: '/movie/ab12' }],
        },
      },
    });
    await sw.fire('notificationclick', event);

    expect(sw.opened).toEqual(['https://kroma.test/movie/ab12']);
    expect(sw.fetches).toEqual([]);
  });

  it('falls back to the root when a notification carries no link at all', async () => {
    const sw = load();
    const { event } = clickEvent({ notification: { close: vi.fn(), data: undefined } });
    await sw.fire('notificationclick', event);
    expect(sw.opened).toEqual(['https://kroma.test/']);
  });
});
