import { afterEach, describe, expect, it, vi } from 'vitest';
import { npmRegistry } from './registry';

type Reply = { exitCode: number; stdout: string; stderr: string };

const state = vi.hoisted(() => ({ reply: undefined as unknown, calls: [] as unknown[][] }));

vi.mock('bun', () => ({
  $: (_strings: TemplateStringsArray, ...values: unknown[]) => {
    state.calls.push(values);
    const reply = {
      nothrow: () => ({ quiet: async () => state.reply as Reply }),
      then: (resolve: () => void) => resolve(),
    };
    return reply;
  },
}));

function answer(exitCode: number, stdout: string, stderr = ''): void {
  state.reply = { exitCode, stdout: Buffer.from(stdout), stderr: Buffer.from(stderr) };
}

afterEach(() => {
  vi.unstubAllGlobals();
  state.calls.length = 0;
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
