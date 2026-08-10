import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startHealthMonitor } from './healthMonitor';

// Fake timers so the self-adjusting poll loop is deterministic; probes are async,
// so advance with the *Async helpers to also flush the microtask queue.
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('startHealthMonitor', () => {
  it('flips offline then back online, firing onReconnect once on recovery', async () => {
    let up = true;
    const changes: boolean[] = [];
    const reconnect = vi.fn();
    const m = startHealthMonitor({
      probe: () => Promise.resolve(up),
      onChange: (o) => changes.push(o),
      onReconnect: reconnect,
      onlineMs: 1000,
      offlineMs: 300,
    });

    // Initial probe: server up, matches the default → no flip, no reconnect.
    await vi.advanceTimersByTimeAsync(0);
    expect(changes).toEqual([]);
    expect(reconnect).not.toHaveBeenCalled();

    // Server drops; the next online-cadence tick (1000ms) reports it.
    up = false;
    await vi.advanceTimersByTimeAsync(1000);
    expect(changes).toEqual([false]);

    // Still down one offline-cadence tick later (300ms): no duplicate flip.
    await vi.advanceTimersByTimeAsync(300);
    expect(changes).toEqual([false]);

    // Server returns; the next offline-cadence tick flips back + reconnects once.
    up = true;
    await vi.advanceTimersByTimeAsync(300);
    expect(changes).toEqual([false, true]);
    expect(reconnect).toHaveBeenCalledTimes(1);

    m.stop();
  });

  it('detects a server that is already down at startup', async () => {
    const changes: boolean[] = [];
    startHealthMonitor({
      probe: () => Promise.resolve(false),
      onChange: (o) => changes.push(o),
      onlineMs: 1000,
      offlineMs: 300,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(changes).toEqual([false]);
  });

  it('treats a rejected probe as offline', async () => {
    let fail = false;
    const changes: boolean[] = [];
    startHealthMonitor({
      probe: () => (fail ? Promise.reject(new Error('unreachable')) : Promise.resolve(true)),
      onChange: (o) => changes.push(o),
      onlineMs: 1000,
      offlineMs: 300,
    });
    await vi.advanceTimersByTimeAsync(0);
    fail = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(changes).toEqual([false]);
  });

  it('recheck() probes immediately instead of waiting for the next tick', async () => {
    let up = true;
    const changes: boolean[] = [];
    const m = startHealthMonitor({
      probe: () => Promise.resolve(up),
      onChange: (o) => changes.push(o),
      onlineMs: 100_000, // so only recheck() can trigger the next probe
      offlineMs: 100_000,
    });
    await vi.advanceTimersByTimeAsync(0);
    up = false;
    m.recheck();
    await vi.advanceTimersByTimeAsync(0);
    expect(changes).toEqual([false]);
    m.stop();
  });

  it('coalesces overlapping probes (recheck while one is in flight is a no-op)', async () => {
    let resolve: (v: boolean) => void = () => {};
    const probe = vi.fn(() => new Promise<boolean>((r) => (resolve = r)));
    const m = startHealthMonitor({
      probe,
      onChange: () => {},
      onlineMs: 1000,
      offlineMs: 1000,
    });
    // Initial probe is in flight (pending); extra rechecks must not start more.
    expect(probe).toHaveBeenCalledTimes(1);
    m.recheck();
    m.recheck();
    expect(probe).toHaveBeenCalledTimes(1);
    resolve(true);
    await vi.advanceTimersByTimeAsync(0);
    m.stop();
  });

  it('polls slowly by default, and quickly once the server is down', async () => {
    let up = true;
    const probe = vi.fn(() => Promise.resolve(up));
    const m = startHealthMonitor({ probe, onChange: () => {} });
    await vi.advanceTimersByTimeAsync(0);
    expect(probe).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(7999);
    expect(probe).toHaveBeenCalledTimes(1);
    up = false;
    await vi.advanceTimersByTimeAsync(1);
    expect(probe).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(3000);
    expect(probe).toHaveBeenCalledTimes(3);
    m.stop();
  });

  it('schedules nothing more when stop() lands while a probe is in flight', async () => {
    let resolve: (v: boolean) => void = () => {};
    const probe = vi.fn(() => new Promise<boolean>((r) => (resolve = r)));
    const m = startHealthMonitor({ probe, onChange: () => {}, onlineMs: 100, offlineMs: 100 });
    m.stop();
    resolve(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('stop() halts the loop (no further probes)', async () => {
    const probe = vi.fn(() => Promise.resolve(true));
    const m = startHealthMonitor({
      probe,
      onChange: () => {},
      onlineMs: 500,
      offlineMs: 500,
    });
    await vi.advanceTimersByTimeAsync(0);
    const before = probe.mock.calls.length;
    m.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(probe.mock.calls).toHaveLength(before);
  });
});
