import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { npmRegistry } from './registry';

type Reply = { exitCode: number; stdout: string; stderr: string };

const state = vi.hoisted(() => ({
  reply: undefined as unknown,
  calls: [] as unknown[][],
  replies: [] as unknown[],
}));

vi.mock('node:timers/promises', () => ({ setTimeout: vi.fn(async () => {}) }));

vi.mock('bun', () => ({
  $: (_strings: TemplateStringsArray, ...values: unknown[]) => {
    state.calls.push(values);
    const reply = {
      nothrow: () => {
        const value = (state.replies.shift() ?? state.reply) as Reply;
        return {
          quiet: async () => value,
          then: (resolve: (value: Reply) => void) => resolve(value),
        };
      },
      then: (resolve: () => void) => resolve(),
    };
    return reply;
  },
}));

function answer(exitCode: number, stdout: string, stderr = ''): void {
  state.reply = { exitCode, stdout: Buffer.from(stdout), stderr: Buffer.from(stderr) };
}

beforeEach(() => answer(0, ''));

afterEach(() => {
  vi.unstubAllGlobals();
  state.calls.length = 0;
  state.replies.length = 0;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('npmRegistry.publishedTarball', () => {
  it('downloads the tarball the tag points at', async () => {
    answer(0, '"https://registry.npmjs.org/x/-/x-1.tgz"');
    vi.stubGlobal('fetch', async () => new Response(new Uint8Array([1, 2])));

    const bytes = await npmRegistry.publishedTarball('x', 'canary');

    expect([...(bytes ?? [])]).toEqual([1, 2]);
  });

  it('takes the last url when npm lists several', async () => {
    answer(0, '["https://a.test/1.tgz","https://a.test/2.tgz"]');
    const fetched = vi.fn(async () => new Response(new Uint8Array()));
    vi.stubGlobal('fetch', fetched);

    await npmRegistry.publishedTarball('x', 'canary');

    expect(fetched).toHaveBeenCalledWith('https://a.test/2.tgz');
  });

  it('answers null when the package or tag is not there', async () => {
    answer(1, '', 'npm error code E404');

    expect(await npmRegistry.publishedTarball('x', 'canary')).toBeNull();
  });

  it('answers null when npm prints nothing', async () => {
    answer(0, '');

    expect(await npmRegistry.publishedTarball('x', 'canary')).toBeNull();
  });

  it('fails on any other npm error', async () => {
    answer(1, '', 'npm error network');

    await expect(npmRegistry.publishedTarball('x', 'canary')).rejects.toThrow(/network/);
  });

  it('refuses output that is not a url', async () => {
    answer(0, '"nope"');

    await expect(npmRegistry.publishedTarball('x', 'canary')).rejects.toThrow();
  });

  it('fails when the download does', async () => {
    answer(0, '"https://a.test/1.tgz"');
    vi.stubGlobal('fetch', async () => new Response('', { status: 500 }));

    await expect(npmRegistry.publishedTarball('x', 'canary')).rejects.toThrow(/500/);
  });
});

describe('npmRegistry.publish', () => {
  it('passes the tag, provenance and dry run to npm', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await npmRegistry.publish('p.tgz', { tag: 'canary', provenance: true, dryRun: true });

    expect(state.calls[0]).toEqual([
      ['publish', 'p.tgz', '--access', 'public', '--tag', 'canary', '--provenance', '--dry-run'],
    ]);
  });

  it('publishes plainly without the flags', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await npmRegistry.publish('p.tgz', { tag: 'latest', provenance: false, dryRun: false });

    expect(state.calls[0]).toEqual([['publish', 'p.tgz', '--access', 'public', '--tag', 'latest']]);
  });
});

const conflict =
  'TLOG_CREATE_ENTRY_ERROR: (409) an equivalent entry already exists in the transparency log';

it('retries the provenance conflict with provenance still enabled', async () => {
  state.replies.push({ exitCode: 1, stdout: '', stderr: conflict });
  await npmRegistry.publish('p.tgz', { tag: 'canary', provenance: true, dryRun: false });
  expect(state.calls).toHaveLength(2);
  expect(state.calls[1]).toEqual(state.calls[0]);
  expect(state.calls[1]?.[0]).toContain('--provenance');
});

it('fails after repeated provenance conflicts', async () => {
  answer(1, '', conflict);
  await expect(
    npmRegistry.publish('p.tgz', { tag: 'canary', provenance: true, dryRun: false }),
  ).rejects.toThrow(/TLOG_CREATE_ENTRY_ERROR/);
  expect(state.calls).toHaveLength(3);
  expect(vi.mocked(delay).mock.calls).toEqual([[10_000], [20_000]]);
});

it.each([
  'E403 forbidden',
  'EPUBLISHCONFLICT already published',
  'TLOG_CREATE_ENTRY_ERROR: unrelated failure',
])('does not retry %s', async (message) => {
  answer(1, '', message);
  await expect(
    npmRegistry.publish('p.tgz', { tag: 'canary', provenance: true, dryRun: false }),
  ).rejects.toThrow(message);
  expect(state.calls).toHaveLength(1);
});

it('propagates a different error from the retry', async () => {
  state.replies.push({ exitCode: 1, stdout: '', stderr: conflict });
  answer(1, '', 'E403 forbidden');
  await expect(
    npmRegistry.publish('p.tgz', { tag: 'canary', provenance: true, dryRun: false }),
  ).rejects.toThrow(/E403/);
  expect(state.calls).toHaveLength(2);
});

it.each([
  { provenance: false, dryRun: false },
  { provenance: true, dryRun: true },
])('does not retry when provenance is disabled or publishing is a dry run: %o', async (options) => {
  answer(1, '', conflict);
  await expect(npmRegistry.publish('p.tgz', { tag: 'canary', ...options })).rejects.toThrow(
    /TLOG_CREATE_ENTRY_ERROR/,
  );
  expect(state.calls).toHaveLength(1);
  expect(delay).not.toHaveBeenCalled();
});
