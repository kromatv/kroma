// The Tizen Smart Hub preview, foreground half.
//
// The carousel on the TV's home screen is drawn by the platform from data a
// BACKGROUND SERVICE provides, and that service cannot reach KROMA on its own -
// no shared localStorage, no mDNS, and no `fs`. So the work is split: this
// module builds the tile JSON from the live catalog and writes it to the
// package-private dir, and the service reads that file and calls
// `webapis.preview.setPreviewData()`.
//
// Everything here is best-effort by design, which is exactly what makes it worth
// testing: on a real television every failure below is silent. The app is not on
// screen when the carousel is wrong, there is no console to read, and the only
// symptom is a home row showing yesterday's films - or the app failing to start
// because a write threw on a set nobody could reproduce.
//
// The throttle is a Samsung policy rather than an optimisation: preview data
// should not refresh more than about once per ten minutes. The file is kept
// current on every catalog change regardless, because the TV also polls the
// service on its own schedule.

import type { ContinueItem, KromaClient, MediaItem } from '@kroma/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const buildPreviewData = vi.hoisted(() => vi.fn(() => '{"sections":[]}' as string | null));
vi.mock('#tv/shared/preview/cards', () => ({ buildPreviewData }));

/** A fake Tizen runtime, recording what the app did to it. */
function runtime(over: { resolveFails?: boolean; openFails?: boolean; noFile?: boolean } = {}) {
  const writes: string[] = [];
  const opened: string[] = [];
  const launched: Array<string | null> = [];
  let closed = 0;
  let created: string | null = null;

  const file = {
    resolve: (name: string) => {
      // A file that is not there yet throws, which is the ONLY way to find out.
      if (over.noFile) throw new Error('not found');
      opened.push(name);
      return stream(name);
    },
    createFile: (name: string) => {
      created = name;
      opened.push(name);
      return stream(name);
    },
  };

  function stream(_name: string) {
    return {
      openStream: (
        _mode: string,
        onSuccess: (s: { write(d: string): void; close(): void }) => void,
        onError: (e: unknown) => void,
      ) => {
        if (over.openFails) {
          onError(new Error('stream refused'));
          return;
        }
        onSuccess({
          write: (data: string) => writes.push(data),
          close: () => {
            closed += 1;
          },
        });
      },
    };
  }

  const tizen = {
    filesystem: {
      resolve: (
        location: string,
        onSuccess: (dir: unknown) => void,
        onError: (e: unknown) => void,
      ) => {
        if (over.resolveFails) {
          onError(new Error(`no ${location}`));
          return;
        }
        onSuccess(file);
      },
    },
    application: {
      getCurrentApplication: () => ({ getRequestedAppControl: () => null }),
      launchAppControl: (_control: unknown, appId: string | null, onSuccess?: () => void) => {
        launched.push(appId);
        onSuccess?.();
      },
    },
    ApplicationControl: class {
      constructor(readonly operation: string) {}
    },
  };

  vi.stubGlobal('tizen', tizen);
  return {
    writes,
    launched,
    opened,
    get closed() {
      return closed;
    },
    get created() {
      return created;
    },
  };
}

const client = {
  continueWatching: vi.fn(async (): Promise<ContinueItem[]> => []),
} as unknown as KromaClient;

const movies = [{ id: 'itm_1' }] as MediaItem[];

/** A fresh copy of the module: the republish throttle is module scope, so a
 *  nudge in one test would otherwise suppress the next test's. */
async function load() {
  vi.resetModules();
  return await import('./service');
}

beforeEach(() => {
  vi.clearAllMocks();
  buildPreviewData.mockReturnValue('{"sections":[]}');
  vi.mocked(client.continueWatching).mockResolvedValue([]);
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('off Tizen', () => {
  it('does nothing at all', async () => {
    // webOS, the desktop shell and the dev server all land here.
    vi.stubGlobal('tizen', undefined);
    const { publishPreview } = await load();
    await publishPreview(client, movies);
    expect(buildPreviewData).not.toHaveBeenCalled();
  });

  it('does nothing on a half-present tizen global', async () => {
    // The feature-detect requires both surfaces this module uses.
    vi.stubGlobal('tizen', { application: {} });
    const { publishPreview } = await load();
    await expect(publishPreview(client, movies)).resolves.toBeUndefined();
    expect(buildPreviewData).not.toHaveBeenCalled();
  });
});

describe('building the carousel', () => {
  it('writes the tile JSON to the package-private file', async () => {
    const tv = runtime();
    const { publishPreview } = await load();
    await publishPreview(client, movies);
    expect(tv.writes).toEqual(['{"sections":[]}']);
    expect(tv.opened).toEqual(['preview.json']);
  });

  it('includes continue-watching when the user is signed in', async () => {
    const resume = [{ item: { id: 'itm_9' } }] as ContinueItem[];
    vi.mocked(client.continueWatching).mockResolvedValue(resume);
    runtime();
    const { publishPreview } = await load();
    await publishPreview(client, movies);
    expect(buildPreviewData).toHaveBeenCalledWith(client, movies, resume);
  });

  it('still publishes the recently-added row when there is no session', async () => {
    vi.mocked(client.continueWatching).mockRejectedValue(new Error('401'));
    const tv = runtime();
    const { publishPreview } = await load();
    await publishPreview(client, movies);
    // Continue-watching is per-user and best-effort; the carousel is not.
    expect(buildPreviewData).toHaveBeenCalledWith(client, movies, []);
    expect(tv.writes).toHaveLength(1);
  });

  it('writes nothing when there is nothing worth showing', async () => {
    buildPreviewData.mockReturnValue(null);
    const tv = runtime();
    const { publishPreview } = await load();
    await publishPreview(client, movies);
    // Better a stale carousel than an empty one.
    expect(tv.writes).toEqual([]);
    expect(tv.launched).toEqual([]);
  });
});

describe('the private file', () => {
  it('creates it the first time, since resolving a missing file throws', async () => {
    const tv = runtime({ noFile: true });
    const { publishPreview } = await load();
    await publishPreview(client, movies);
    expect(tv.created).toBe('preview.json');
    expect(tv.writes).toEqual(['{"sections":[]}']);
  });

  it('always closes the stream', async () => {
    const tv = runtime();
    const { publishPreview } = await load();
    await publishPreview(client, movies);
    // A leaked handle on a television is not reclaimed until the app restarts.
    expect(tv.closed).toBe(1);
  });

  it('survives a directory it cannot resolve', async () => {
    runtime({ resolveFails: true });
    const { publishPreview } = await load();
    // Best-effort: the carousel keeps its previous contents, and the app that
    // called this keeps running.
    await expect(publishPreview(client, movies)).resolves.toBeUndefined();
  });

  it('survives a stream it cannot open', async () => {
    const tv = runtime({ openFails: true });
    const { publishPreview } = await load();
    await expect(publishPreview(client, movies)).resolves.toBeUndefined();
    expect(tv.launched).toEqual([]);
  });
});

describe('nudging the background service', () => {
  it('names the service declared in config.xml', async () => {
    const tv = runtime();
    const { publishPreview } = await load();
    await publishPreview(client, movies);
    // Must match the <tizen:service id>; anything else launches nothing.
    expect(tv.launched).toEqual(['KromaTV001.PreviewSvc']);
  });

  it('holds off for ten minutes, which is Samsung’s policy', async () => {
    const tv = runtime();
    const { publishPreview } = await load();
    await publishPreview(client, movies);
    expect(tv.launched).toHaveLength(1);

    vi.setSystemTime(new Date('2026-01-01T00:09:00Z'));
    await publishPreview(client, movies);
    expect(tv.launched).toHaveLength(1);

    vi.setSystemTime(new Date('2026-01-01T00:10:00Z'));
    await publishPreview(client, movies);
    expect(tv.launched).toHaveLength(2);
  });

  it('keeps the FILE current even while the nudge is held off', async () => {
    const tv = runtime();
    const { publishPreview } = await load();
    await publishPreview(client, movies);
    vi.setSystemTime(new Date('2026-01-01T00:01:00Z'));
    await publishPreview(client, movies);
    // The TV polls the service on its own schedule, so an up-to-date file is
    // what makes the throttle harmless.
    expect(tv.writes).toHaveLength(2);
    expect(tv.launched).toHaveLength(1);
  });

  it('does not nudge when the file was never written', async () => {
    const tv = runtime({ resolveFails: true });
    const { publishPreview } = await load();
    await publishPreview(client, movies);
    // Republishing a file that did not change asks the TV to redraw yesterday's
    // carousel.
    expect(tv.launched).toEqual([]);
  });
});
