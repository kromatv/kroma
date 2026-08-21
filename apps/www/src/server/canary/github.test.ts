import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  artifactsOf,
  DEFAULT_REPO,
  headers,
  latestRuns,
  repoOf,
  signedUrl,
  versionAt,
} from './github.ts';

const env = { GITHUB_TOKEN: 'a-token' };

const answering = (body: unknown, init: { ok?: boolean; status?: number } = {}) =>
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: init.ok ?? true,
      status: init.status ?? 200,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    }),
  );

afterEach(() => vi.unstubAllGlobals());

describe('repoOf', () => {
  it('falls back to the product repo when the worker names none', () => {
    expect(repoOf({})).toBe(DEFAULT_REPO);
    expect(repoOf({ GITHUB_REPO: 'someone/fork' })).toBe('someone/fork');
  });
});

describe('headers', () => {
  it('carries the token when there is one', () => {
    expect(headers(env)).toMatchObject({ authorization: 'Bearer a-token' });
  });

  it('leaves authorization off entirely rather than sending an empty one', () => {
    expect(headers({})).not.toHaveProperty('authorization');
  });
});

describe('latestRuns', () => {
  it('reads the runs a green push to main left behind', async () => {
    answering({
      workflow_runs: [
        {
          id: 1,
          head_sha: 'a'.repeat(40),
          html_url: 'https://github.com/x/y/actions/runs/1',
          updated_at: '2026-08-20T19:14:35Z',
          display_title: 'a commit',
        },
      ],
    });

    expect(await latestRuns(env, 5)).toHaveLength(1);
  });

  it('throws rather than pretending when main has no successful build', async () => {
    answering({ workflow_runs: [] });

    await expect(latestRuns(env, 5)).rejects.toThrow(/no successful build/);
  });
});

describe('artifactsOf', () => {
  it('drops an artifact GitHub has already expired', async () => {
    answering({
      artifacts: [
        { id: 1, name: 'kroma-tizen-wgt', size_in_bytes: 10, expired: false },
        { id: 2, name: 'kroma-webos-ipk', size_in_bytes: 10, expired: true },
      ],
    });

    expect((await artifactsOf(env, 1))?.map((a) => a.name)).toEqual(['kroma-tizen-wgt']);
  });

  it('answers null for a run that never existed, which is the caller mistaking a path', async () => {
    answering({}, { ok: false, status: 404 });

    expect(await artifactsOf(env, 1)).toBeNull();
  });

  it('throws for an outage, so it is told apart from a run that is simply gone', async () => {
    answering({}, { ok: false, status: 500 });

    await expect(artifactsOf(env, 1)).rejects.toThrow(/500/);
  });
});

describe('versionAt', () => {
  it('reads the version the manifest carried at that commit', async () => {
    answering('[package]\nname = "kroma-server"\nversion = "0.1.39"\n');

    expect(await versionAt(env, 'a'.repeat(40))).toBe('0.1.39');
  });

  it('answers null when the manifest is missing or carries no version', async () => {
    answering('', { ok: false, status: 404 });
    expect(await versionAt(env, 'a'.repeat(40))).toBeNull();

    answering('[package]\nname = "kroma-server"\n');
    expect(await versionAt(env, 'a'.repeat(40))).toBeNull();
  });

  it('answers null rather than throwing when raw.githubusercontent cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    expect(await versionAt(env, 'a'.repeat(40))).toBeNull();
  });
});

describe('signedUrl', () => {
  it('hands back the storage URL GitHub redirects to', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ headers: new Headers({ location: 'https://blob/x.zip' }) }),
    );

    expect(await signedUrl(env, 7)).toBe('https://blob/x.zip');
  });

  it('answers null when GitHub declines to redirect', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ headers: new Headers() }));

    expect(await signedUrl(env, 7)).toBeNull();
  });
});
