import { KromaApiError } from '@kromatv/client';
import type { Translate } from '@kromatv/i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  diagnosePlaybackFailure,
  nativePlaybackFailure,
  playbackFailureCopy,
} from './playback-failure';

afterEach(() => vi.unstubAllGlobals());

describe('explaining playback failures', () => {
  it.each([
    ['The file does not exist', 'missing'],
    ['HTTP 403 Forbidden', 'denied'],
    ['NSURLErrorDomain: network connection was lost', 'network'],
    ['This media format is not supported', 'unsupported'],
    ['AVPlayer failed to load this asset', 'unknown'],
  ])('recognizes %s', (message, kind) => {
    expect(nativePlaybackFailure({ message })).toEqual({ kind, detail: message });
  });

  it('uses the server reason and status for API failures in release builds', () => {
    expect(
      nativePlaybackFailure(
        new KromaApiError(404, 'GET /items/a failed', {
          error: 'media file unavailable (mount offline?)',
        }),
      ),
    ).toEqual({ kind: 'missing', detail: 'media file unavailable (mount offline?)' });
  });

  it('keeps signed stream credentials out of the displayed native detail', () => {
    const result = nativePlaybackFailure(
      new Error('Failed https://user:pass@server.test/stream/a?ticket=secret#token'),
    );
    expect(result.detail).toBe('Failed https://server.test/stream/a');
  });

  it('falls back for absent or malformed native errors', () => {
    expect(nativePlaybackFailure(undefined)).toEqual({ kind: 'unknown', detail: undefined });
    expect(nativePlaybackFailure({ message: 42 })).toEqual({ kind: 'unknown', detail: undefined });
  });

  it('reads a terminal stream response to explain the actual server failure', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: 'media file unavailable (mount offline?)' }), {
          status: 404,
        }),
    );
    vi.stubGlobal('fetch', fetch);
    const result = await diagnosePlaybackFailure('https://server.test/master.m3u8?ticket=secret', {
      message: 'AVPlayer failed',
    });
    expect(result).toEqual({ kind: 'missing', detail: 'media file unavailable (mount offline?)' });
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: { Range: 'bytes=0-0' } }),
    );
  });

  it.each([
    [401, 'denied'],
    [503, 'server'],
    [504, 'network'],
  ])('explains HTTP %i even without JSON', async (status, kind) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('upstream failed', { status })),
    );
    expect(
      (await diagnosePlaybackFailure('https://server.test/a', { message: 'Native failure' })).kind,
    ).toBe(kind);
  });

  it('keeps the decoder reason when the server stream is reachable', async () => {
    const cancel = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, body: { cancel } })),
    );
    expect(
      (await diagnosePlaybackFailure('https://server.test/a', { message: 'Unsupported codec' }))
        .kind,
    ).toBe('unsupported');
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('does not probe local files and tolerates an unreachable server', async () => {
    const fetch = vi.fn(async () => {
      throw new Error('offline');
    });
    vi.stubGlobal('fetch', fetch);
    await diagnosePlaybackFailure('file:///movie.mp4', { message: 'No such file' });
    expect(fetch).not.toHaveBeenCalled();
    expect(
      (await diagnosePlaybackFailure('https://server.test/a', { message: 'connection lost' })).kind,
    ).toBe('network');
  });

  it.each(['missing', 'denied', 'network', 'unsupported', 'server', 'unknown'] as const)(
    'gives %s a translated explanation',
    (kind) => {
      const translate = ((key: string) => key) as Translate;
      const copy = playbackFailureCopy({ kind }, translate);
      expect(copy.title).toMatch(/^player\./);
      expect(copy.message).toMatch(/^player\./);
      expect(copy.title).not.toBe('error.serverTitle');
    },
  );
});
