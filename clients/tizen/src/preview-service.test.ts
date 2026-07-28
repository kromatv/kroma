/**
 * The Smart Hub preview service runs on the TV, in a Tizen JS context, even
 * while KROMA is closed — so nothing in the app can exercise it. It ships
 * verbatim from `public/` as plain CommonJS, which means a test can evaluate it
 * against fake `tizen` / `webapis` globals and drive its lifecycle hooks.
 *
 * The behaviour that matters is not the happy path: it is that the service
 * always exits and always closes its stream. A background service that hangs
 * sits on the TV's memory until the set is unplugged.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(
  join(import.meta.dirname, '../public/service/preview-service.js'),
  'utf8',
);

interface Service {
  onStart: () => void;
  onRequest: () => void;
  onExit: () => void;
}

interface Harness {
  service: Service;
  exits: number;
  logs: string[];
  published: string[];
  streamsClosed: number;
  settle: () => Promise<void>;
}

interface Options {
  /** File contents, or `null` for "the file is not there". */
  contents?: string | null;
  /** Throw when resolving the private directory. */
  dirFails?: boolean;
  /** Throw when resolving the file inside the directory. */
  fileMissing?: boolean;
  /** Fail while reading the opened stream. */
  readFails?: boolean;
  /** Omit `webapis.preview.setPreviewData` entirely. */
  noPreviewApi?: boolean;
  /** Have setPreviewData call back with an error. */
  publishFails?: boolean;
}

function load(options: Options = {}): Harness {
  const { contents = '{"sections":[]}' } = options;
  const state = { exits: 0, streamsClosed: 0 };
  const logs: string[] = [];
  const published: string[] = [];

  const stream = {
    get bytesAvailable() {
      return contents === null ? 0 : contents.length;
    },
    read: (n: number) => {
      if (options.readFails) throw new Error('stream read failed');
      return String(contents).slice(0, n);
    },
    close: () => {
      state.streamsClosed += 1;
    },
  };

  const tizen = {
    application: {
      getCurrentApplication: () => ({
        exit: () => {
          state.exits += 1;
        },
      }),
    },
    filesystem: {
      resolve: (_dir: string, onDir: (dir: unknown) => void, onErr: (e: unknown) => void) => {
        if (options.dirFails) {
          onErr(new Error('no such directory'));
          return;
        }
        onDir({
          resolve: () => {
            if (options.fileMissing) throw new Error('no preview.json');
            return {
              openStream: (
                _mode: string,
                onStream: (s: unknown) => void,
                _onErr: (e: unknown) => void,
              ) => onStream(stream),
            };
          },
        });
      },
    },
  };

  const webapis = options.noPreviewApi
    ? {}
    : {
        preview: {
          setPreviewData: (data: string, ok: () => void, fail: (e: unknown) => void) => {
            if (options.publishFails) {
              fail(new Error('preview rejected'));
              return;
            }
            published.push(data);
            ok();
          },
        },
      };

  const module = { exports: {} as Service };
  new Function('module', 'exports', 'tizen', 'webapis', 'console', SOURCE)(
    module,
    module.exports,
    tizen,
    webapis,
    { log: (m: string) => logs.push(String(m)) },
  );

  return {
    service: module.exports,
    logs,
    published,
    get exits() {
      return state.exits;
    },
    get streamsClosed() {
      return state.streamsClosed;
    },
    // The service chains promises; a few microtask turns settle them all.
    settle: async () => {
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
    },
  } as Harness;
}

describe('the preview service lifecycle', () => {
  it('exposes the three hooks the platform calls', () => {
    const { service } = load();
    expect(typeof service.onStart).toBe('function');
    expect(typeof service.onRequest).toBe('function');
    expect(typeof service.onExit).toBe('function');
  });

  it('start and exit do nothing but log', () => {
    // The platform calls onStart on every wake; doing work there would run
    // the read twice per request.
    const h = load();
    h.service.onStart();
    h.service.onExit();
    expect(h.published).toEqual([]);
    expect(h.exits).toBe(0);
    expect(h.logs.join(' ')).toContain('service start');
  });
});

describe('publishing the carousel', () => {
  it('hands the file straight to the preview API and then exits', async () => {
    const h = load({ contents: '{"sections":[{"title":"New"}]}' });
    h.service.onRequest();
    await h.settle();

    expect(h.published).toEqual(['{"sections":[{"title":"New"}]}']);
    // A background service that does not exit sits on the TV's memory.
    expect(h.exits).toBe(1);
    expect(h.streamsClosed).toBe(1);
  });

  it('exits even when there is nothing to publish yet', async () => {
    // Before the app has ever run there is no preview.json. That is a normal
    // first-boot state, not a reason to stay resident.
    const h = load({ contents: null });
    h.service.onRequest();
    await h.settle();

    expect(h.published).toEqual([]);
    expect(h.exits).toBe(1);
    expect(h.logs.join(' ')).toContain('skip:');
  });

  it('exits when the private directory cannot be resolved', async () => {
    const h = load({ dirFails: true });
    h.service.onRequest();
    await h.settle();
    expect(h.exits).toBe(1);
  });

  it('exits when preview.json is not in the directory', async () => {
    const h = load({ fileMissing: true });
    h.service.onRequest();
    await h.settle();
    expect(h.exits).toBe(1);
  });

  it('closes the stream even when the read throws', async () => {
    // The stream is a platform handle. Leaking one on the error path leaks it
    // on exactly the runs that repeat.
    const h = load({ readFails: true });
    h.service.onRequest();
    await h.settle();

    expect(h.streamsClosed).toBe(1);
    expect(h.exits).toBe(1);
    expect(h.published).toEqual([]);
  });

  it('exits when the TV firmware has no preview API', async () => {
    // Older Tizen versions do not expose it; the service must not throw its
    // way out of the runtime.
    const h = load({ noPreviewApi: true });
    h.service.onRequest();
    await h.settle();

    expect(h.exits).toBe(1);
    expect(h.logs.join(' ')).toContain('unavailable');
  });

  it('exits when the preview API rejects the data', async () => {
    const h = load({ publishFails: true });
    h.service.onRequest();
    await h.settle();
    expect(h.exits).toBe(1);
  });
});

describe('when the runtime is hostile', () => {
  it('survives a Tizen context with no console at all', () => {
    // `console` may be absent in the service runtime, and logging must never
    // be what breaks the service.
    const module = { exports: {} as Service };
    const tizen = {
      application: { getCurrentApplication: () => ({ exit: () => {} }) },
      filesystem: { resolve: () => {} },
    };
    new Function('module', 'exports', 'tizen', 'webapis', 'console', SOURCE)(
      module,
      module.exports,
      tizen,
      {},
      undefined,
    );
    expect(() => module.exports.onStart()).not.toThrow();
    expect(() => module.exports.onExit()).not.toThrow();
  });

  it('exits rather than hanging when the filesystem itself is gone', async () => {
    // The throw happens inside a promise executor, so it surfaces as a
    // REJECTION rather than escaping onRequest - which is why the exit is
    // asynchronous. Either way the service must not stay resident.
    const module = { exports: {} as Service };
    let exits = 0;
    const tizen = {
      application: {
        getCurrentApplication: () => ({
          exit: () => {
            exits += 1;
          },
        }),
      },
      filesystem: {
        resolve: () => {
          throw new Error('filesystem is gone');
        },
      },
    };
    new Function('module', 'exports', 'tizen', 'webapis', 'console', SOURCE)(
      module,
      module.exports,
      tizen,
      {},
      { log: () => {} },
    );

    expect(() => module.exports.onRequest()).not.toThrow();
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
    expect(exits).toBeGreaterThanOrEqual(1);
  });
});
