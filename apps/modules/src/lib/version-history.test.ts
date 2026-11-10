import { afterEach, describe, expect, it, vi } from 'vitest';
import { describedVersions, withDescriptions } from './version-history';

const SRI = `sha256-${btoa(String.fromCharCode(...Array(32).fill(0xab)))}`;

const OLD = {
  schemaVersion: 3,
  engines: { server: '>=0.1.38' },
  artifacts: [{ target: null, url: 'https://dl/old.kmod', size: 9, integrity: SRI }],
};

const HISTORY = { schema: 1, modules: { 'tv.kroma.demo': { '0.9.0': OLD } } };

function serving(body: unknown, status = 200) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
    }),
  );
  return calls;
}

const bg = () => vi.fn();

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('describedVersions', () => {
  it('reads what each version of a module needs', async () => {
    vi.stubGlobal('caches', undefined);
    serving(HISTORY);

    const versions = await describedVersions({}, bg(), 'tv.kroma.demo');

    expect(versions?.['0.9.0']?.engines).toEqual({ server: '>=0.1.38' });
  });

  it('reads the history off the repository the registry serves', async () => {
    vi.stubGlobal('caches', undefined);
    const calls = serving(HISTORY);

    await describedVersions({ GITHUB_REPO: 'someone/fork' }, bg(), 'tv.kroma.demo');

    expect(calls).toEqual([
      'https://github.com/someone/fork/releases/download/modules/history.json',
    ]);
  });

  it('answers nothing for a module the history does not name', async () => {
    vi.stubGlobal('caches', undefined);
    serving(HISTORY);

    expect(await describedVersions({}, bg(), 'tv.kroma.other')).toBeUndefined();
  });

  it('answers nothing when the history cannot be fetched', async () => {
    vi.stubGlobal('caches', undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    serving('down', 503);

    expect(await describedVersions({}, bg(), 'tv.kroma.demo')).toBeUndefined();
  });

  it('answers nothing for a document in a shape it does not read', async () => {
    vi.stubGlobal('caches', undefined);
    serving({ schema: 2, modules: HISTORY.modules });

    expect(await describedVersions({}, bg(), 'tv.kroma.demo')).toBeUndefined();
  });
});

describe('withDescriptions', () => {
  const bare = { artifacts: OLD.artifacts };

  it('replaces a bare listed version with its full description', () => {
    const known = withDescriptions({ versions: { '0.9.0': bare } }, { '0.9.0': OLD });

    expect(known?.versions?.['0.9.0']).toEqual(OLD);
  });

  it('keeps a version only the listing knows', () => {
    const known = withDescriptions({ versions: { '0.8.0': bare } }, { '0.9.0': OLD });

    expect(Object.keys(known?.versions ?? {}).sort()).toEqual(['0.8.0', '0.9.0']);
  });

  it('leaves the listing as it is when there is no history', () => {
    const listed = { versions: { '0.8.0': bare } };

    expect(withDescriptions(listed, undefined)).toBe(listed);
  });
});
