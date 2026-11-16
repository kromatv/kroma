import { describe, expect, it } from 'vitest';
import { GitHubError } from '#site/github/client';
import { fakeGitHub, sha } from '#site/github/test-support';
import { memoryStore } from '#site/store/memory-store';
import type { Store } from '#site/store/store';
import { handleDelivery, type Handling } from './webhook';

const BRANCH_REF = 'DELETE /repos/o/r/git/refs/heads/lingua/ada/fr';

async function storeProposing(branch: string) {
  const store = memoryStore();
  await store.saveProposal({
    project: 'o/r',
    userId: 42,
    locale: 'fr',
    branch,
    prNumber: 9,
    prUrl: 'https://github.com/o/r/pull/9',
    headSha: 'h',
    updatedAt: 1,
  });
  return store;
}

function closed(head: { ref: string; label: string; repo: string | null }) {
  return {
    event: 'pull_request',
    payload: {
      action: 'closed',
      installation: { id: 1 },
      repository: { full_name: 'o/r', default_branch: 'main' },
      pull_request: {
        head: { ref: head.ref, label: head.label, repo: head.repo ? { full_name: head.repo } : null },
      },
    },
  };
}

describe('a closed pull request', () => {
  it('settles a proposal from a fork and leaves the fork’s branch alone', async () => {
    const store = await storeProposing('ada:lingua/fr');
    const gh = fakeGitHub({ routes: {} });

    await handleDelivery(
      { connect: async () => gh, store, now: 2 },
      closed({ ref: 'lingua/fr', label: 'Ada:lingua/fr', repo: 'Ada/r' }),
    );

    expect(await store.proposal('o/r', 42, 'fr')).toBeNull();
    expect(gh.calls).toEqual([]);
  });

  it('settles a proposal from a fork its owner has since deleted', async () => {
    const store = await storeProposing('ada:lingua/fr');

    await handleDelivery(
      { connect: async () => fakeGitHub({ routes: {} }), store, now: 2 },
      closed({ ref: 'lingua/fr', label: 'Ada:lingua/fr', repo: null }),
    );

    expect(await store.proposal('o/r', 42, 'fr')).toBeNull();
  });

  it('settles a proposal the App pushed to the project and deletes its branch', async () => {
    const store = await storeProposing('lingua/ada/fr');
    const gh = fakeGitHub({ routes: { [BRANCH_REF]: () => null } });

    await handleDelivery(
      { connect: async () => gh, store, now: 2 },
      closed({ ref: 'lingua/ada/fr', label: 'o:lingua/ada/fr', repo: 'o/r' }),
    );

    expect(await store.proposal('o/r', 42, 'fr')).toBeNull();
    expect(gh.calls.map((c) => `${c.method} ${c.path}`)).toEqual([BRANCH_REF]);
  });
});

describe('a closed pull request Lingua cannot settle', () => {
  it('leaves a pull request Lingua did not open alone', async () => {
    const store = await storeProposing('lingua/ada/fr');
    const gh = fakeGitHub({ routes: {} });

    await handleDelivery(
      { connect: async () => gh, store, now: 2 },
      closed({ ref: 'feature', label: 'o:feature', repo: 'o/r' }),
    );

    expect(await store.proposal('o/r', 42, 'fr')).not.toBeNull();
    expect(gh.calls).toEqual([]);
  });

  it('settles a proposal whose branch someone already deleted', async () => {
    const store = await storeProposing('lingua/ada/fr');
    const gh = fakeGitHub({ routes: { [BRANCH_REF]: () => { throw new GitHubError(422, 'Reference does not exist'); } } });

    await handleDelivery({ connect: async () => gh, store, now: 2 }, closed({ ref: 'lingua/ada/fr', label: 'o:lingua/ada/fr', repo: 'o/r' }));

    expect(await store.proposal('o/r', 42, 'fr')).toBeNull();
  });

  it('passes on any other failure to delete the branch', async () => {
    const store = await storeProposing('lingua/ada/fr');
    const gh = fakeGitHub({ routes: { [BRANCH_REF]: () => { throw new GitHubError(500, 'down'); } } });

    const handled = handleDelivery({ connect: async () => gh, store, now: 2 }, closed({ ref: 'lingua/ada/fr', label: 'o:lingua/ada/fr', repo: 'o/r' }));

    await expect(handled).rejects.toThrow('down');
  });
});

const CONFIG = JSON.stringify({ projects: [{ path: 'loc' }] });

function repository(branch = 'main') {
  return fakeGitHub({
    routes: {
      'GET /installation/repositories?per_page=100': () => ({ repositories: [{ full_name: 'o/r', default_branch: 'main' }] }),
      [`GET /repos/o/r/contents/lingua.json?ref=${branch}`]: () => ({}),
      [`GET /repos/o/r/branches/${branch}`]: () => ({ commit: { sha: sha('b'), commit: { tree: { sha: sha('0e') } } } }),
      [`GET /repos/o/r/git/trees/${sha('0e')}?recursive=1`]: () => ({
        truncated: false,
        tree: [
          { path: 'lingua.json', type: 'blob', sha: sha('c') },
          { path: 'loc/i18n.json', type: 'blob', sha: sha('d') },
        ],
      }),
    },
    blobs: { [sha('c')]: CONFIG, [sha('d')]: '{"source":"en"}' },
  });
}

function push(ref: string, touched: string[] = []) {
  return {
    event: 'push',
    payload: {
      ref,
      installation: { id: 1 },
      repository: { full_name: 'o/r', default_branch: 'main' },
      commits: [{ added: [], modified: touched }],
    },
  };
}

const synced = async (store: Store) => (await store.project('o/r'))?.headSha ?? null;

const handling = (store: Store, gh: ReturnType<typeof fakeGitHub>, over: Partial<Handling> = {}): Handling => ({
  connect: async () => gh,
  store,
  now: 2,
  ...over,
});

const discovered = (gh: ReturnType<typeof fakeGitHub>) => gh.calls.some((c) => c.path.startsWith('/installation/repositories'));

describe('a push', () => {
  it('discovers a repository Lingua did not know and syncs it', async () => {
    const store = memoryStore();
    const gh = repository();

    await handleDelivery(handling(store, gh), push('refs/heads/main'));

    expect(await synced(store)).toBe(sha('b'));
  });

  it('syncs a known repository without asking the installation again', async () => {
    const store = memoryStore();
    await store.upsertProject('o/r', 1, 'main');
    const gh = repository();

    await handleDelivery(handling(store, gh), push('refs/heads/main'));

    expect(discovered(gh)).toBe(false);
    expect(await synced(store)).toBe(sha('b'));
  });

  it('asks the installation again when the push touched lingua.json', async () => {
    const store = memoryStore();
    await store.upsertProject('o/r', 1, 'main');
    const gh = repository();

    await handleDelivery(handling(store, gh), push('refs/heads/main', ['lingua.json']));

    expect(discovered(gh)).toBe(true);
  });

  it('ignores a push to a branch Lingua does not track', async () => {
    const store = memoryStore();
    const gh = repository();

    await handleDelivery(handling(store, gh), push('refs/heads/feature'));

    expect(gh.calls).toEqual([]);
  });

  it('follows the branch an operator pinned instead of the default one', async () => {
    const store = memoryStore();
    const gh = repository('next');

    await handleDelivery(handling(store, gh, { branches: new Map([['o/r', 'next']]) }), push('refs/heads/next'));

    expect(await store.project('o/r')).toMatchObject({ branch: 'next', headSha: sha('b') });
  });
});

describe('an installation event', () => {
  it('syncs every repository an installation reaches once it changes', async () => {
    const store = memoryStore();
    const gh = repository();

    await handleDelivery(handling(store, gh), { event: 'installation_repositories', payload: { action: 'added', installation: { id: 1 } } });

    expect(await synced(store)).toBe(sha('b'));
  });

  it('forgets every project of a deleted installation', async () => {
    const store = memoryStore();
    await store.upsertProject('o/r', 1, 'main');

    await handleDelivery(handling(store, repository()), { event: 'installation', payload: { action: 'deleted', installation: { id: 1 } } });

    expect(await store.projects()).toEqual([]);
  });

  it('ignores a delivery it cannot read, or an event it does not act on', async () => {
    const store = memoryStore();
    const gh = repository();

    await handleDelivery(handling(store, gh), { event: 'installation', payload: { action: 'created' } });
    await handleDelivery(handling(store, gh), { event: 'pull_request', payload: { action: 'opened' } });
    await handleDelivery(handling(store, gh), { event: 'star', payload: {} });

    expect(gh.calls).toEqual([]);
  });
});
