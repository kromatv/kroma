import { describe, expect, it, vi } from 'vitest';
import { type Navigations, reportScreenTimings } from './screen-timings';

function fakeRouter() {
  const listeners = new Map<string, () => void>();
  const router: Navigations & { matches: { routeId: string }[] } = {
    matches: [],
    subscribe: (event, listener) => {
      listeners.set(event, listener);
      return () => listeners.delete(event);
    },
    get state() {
      return { matches: router.matches };
    },
  };
  const emit = (event: string) => listeners.get(event)?.();
  return { router, emit, listeners };
}

describe('reportScreenTimings', () => {
  it('times a screen from the navigation that asked for it to its render', () => {
    const { router, emit } = fakeRouter();
    const report = vi.fn();
    const ticks = [100, 340];
    reportScreenTimings(router, report, () => ticks.shift() ?? 0);

    emit('onBeforeNavigate');
    router.matches = [{ routeId: '__root__' }, { routeId: '/_app/shows/$id' }];
    emit('onRendered');

    expect(report).toHaveBeenCalledWith('web /_app/shows/$id', 240);
  });

  it('stops listening once unsubscribed', () => {
    const { router, listeners } = fakeRouter();

    reportScreenTimings(router, vi.fn())();

    expect(listeners.size).toBe(0);
  });
});
