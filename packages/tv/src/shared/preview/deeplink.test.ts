import { afterEach, describe, expect, it, vi } from 'vitest';
import { onDeepLink, readDeepLink, requestDeepLink } from './deeplink';

type Opts = {
  payload?: string; // the PAYLOAD value[0], if present
  noPayloadKey?: boolean; // data present but no PAYLOAD entry
  nullControl?: boolean; // getRequestedAppControl() returns null
  throwControl?: boolean; // getRequestedAppControl() throws
};

function payloadData(opts: Opts) {
  if (opts.noPayloadKey) return [{ key: 'OTHER', value: ['x'] }];
  if (opts.payload !== undefined) return [{ key: 'PAYLOAD', value: [opts.payload] }];
  return [];
}

function stubTizen(opts: Opts = {}) {
  const data = payloadData(opts);
  const getRequestedAppControl = () => {
    if (opts.throwControl) throw new Error('boom');
    if (opts.nullControl) return null;
    return { appControl: { operation: 'op', data } };
  };
  vi.stubGlobal('tizen', {
    filesystem: {},
    application: { getCurrentApplication: () => ({ getRequestedAppControl }) },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readDeepLink', () => {
  it('returns null when there is no tizen platform', () => {
    expect(readDeepLink()).toBeNull();
  });

  it('reads a link a shell pushed before the app was listening', () => {
    // A launcher tile cold-starts the app, so the link exists while there is
    // still no tree to put it in (see requestDeepLink).
    requestDeepLink({ type: 'movie', id: 'itm42' });
    expect(readDeepLink()).toEqual({ type: 'movie', id: 'itm42' });
  });

  it('hands a pushed link over only once', () => {
    // Otherwise a later remount replays a tile the user opened minutes ago.
    requestDeepLink({ type: 'show', id: 'sh7' });
    expect(readDeepLink()).toEqual({ type: 'show', id: 'sh7' });
    expect(readDeepLink()).toBeNull();
  });

  it('decodes a direct JSON payload', () => {
    stubTizen({ payload: JSON.stringify({ type: 'movie', id: 'abc' }) });
    expect(readDeepLink()).toEqual({ type: 'movie', id: 'abc' });
  });

  it('decodes a Samsung { values } wrapped, uri-encoded payload', () => {
    const inner = encodeURIComponent(JSON.stringify({ type: 'show', id: 's1' }));
    stubTizen({ payload: JSON.stringify({ values: inner }) });
    expect(readDeepLink()).toEqual({ type: 'show', id: 's1' });
  });

  it('returns null for malformed JSON', () => {
    stubTizen({ payload: '{not json' });
    expect(readDeepLink()).toBeNull();
  });

  it('returns null for a well-formed but wrong-shaped payload', () => {
    stubTizen({ payload: JSON.stringify({ type: 'other', id: 5 }) });
    expect(readDeepLink()).toBeNull();
  });

  it('returns null when the id is not a string', () => {
    stubTizen({ payload: JSON.stringify({ type: 'movie', id: 42 }) });
    expect(readDeepLink()).toBeNull();
  });

  it('returns null for a payload that is not an object at all', () => {
    stubTizen({ payload: 'null' });
    expect(readDeepLink()).toBeNull();
  });

  it('returns null when there is no PAYLOAD entry', () => {
    stubTizen({ noPayloadKey: true });
    expect(readDeepLink()).toBeNull();
  });

  it('returns null when getRequestedAppControl yields null', () => {
    stubTizen({ nullControl: true });
    expect(readDeepLink()).toBeNull();
  });

  it('returns null (not throw) when the platform call throws', () => {
    stubTizen({ throwControl: true });
    expect(readDeepLink()).toBeNull();
  });
});

describe('onDeepLink', () => {
  it('returns a no-op cleanup when there is no tizen platform', () => {
    const cleanup = onDeepLink(() => undefined);
    expect(cleanup()).toBeUndefined();
  });

  it('delivers a shell push straight to a live listener', () => {
    const seen: unknown[] = [];
    const cleanup = onDeepLink((link) => seen.push(link));
    requestDeepLink({ type: 'movie', id: 'warm' });
    expect(seen).toEqual([{ type: 'movie', id: 'warm' }]);
    // Delivered, so nothing is kept: a remount must not replay it.
    cleanup();
    expect(readDeepLink()).toBeNull();
  });

  it('replays a link that arrived before the listener existed', () => {
    requestDeepLink({ type: 'show', id: 'cold' });
    const seen: unknown[] = [];
    const cleanup = onDeepLink((link) => seen.push(link));
    expect(seen).toEqual([{ type: 'show', id: 'cold' }]);
    cleanup();
  });

  it('stops delivering after cleanup, and keeps the link for the next listener', () => {
    const seen: unknown[] = [];
    onDeepLink((link) => seen.push(link))();
    requestDeepLink({ type: 'movie', id: 'gone' });
    expect(seen).toEqual([]);
    // With nobody listening it is kept, exactly like a cold start - which also
    // drains it, so the module is left clean for the next test.
    expect(readDeepLink()).toEqual({ type: 'movie', id: 'gone' });
  });

  it('subscribes to nothing on a browser shell with no tizen platform', () => {
    const listeners = new Map<string, () => void>();
    vi.stubGlobal('window', {
      addEventListener: (type: string, h: () => void) => listeners.set(type, h),
      removeEventListener: (type: string) => listeners.delete(type),
    });
    const cb = vi.fn();
    const cleanup = onDeepLink(cb);
    expect(listeners.has('appcontrol')).toBe(false);
    requestDeepLink({ type: 'movie', id: 'web1' });
    expect(cb).toHaveBeenCalledWith({ type: 'movie', id: 'web1' });
    cleanup();
  });

  it('subscribes to appcontrol and fires cb with the decoded link', () => {
    const listeners = new Map<string, () => void>();
    vi.stubGlobal('window', {
      addEventListener: (type: string, h: () => void) => listeners.set(type, h),
      removeEventListener: (type: string) => listeners.delete(type),
    });
    stubTizen({ payload: JSON.stringify({ type: 'movie', id: 'm9' }) });

    const cb = vi.fn();
    const cleanup = onDeepLink(cb);
    // Simulate the platform re-targeting the running app.
    listeners.get('appcontrol')?.();
    expect(cb).toHaveBeenCalledWith({ type: 'movie', id: 'm9' });

    cleanup();
    expect(listeners.has('appcontrol')).toBe(false);
  });

  it('does not fire cb when the re-target carries no valid link', () => {
    const listeners = new Map<string, () => void>();
    vi.stubGlobal('window', {
      addEventListener: (type: string, h: () => void) => listeners.set(type, h),
      removeEventListener: (type: string) => listeners.delete(type),
    });
    stubTizen({ payload: '{bad' });
    const cb = vi.fn();
    onDeepLink(cb);
    listeners.get('appcontrol')?.();
    expect(cb).not.toHaveBeenCalled();
  });
});
