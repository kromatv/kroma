import { describe, expect, it } from 'vitest';
import { fakeGitHub } from '#site/github/test-support';
import { memoryStore } from '#site/store/memory-store';
import { handleDelivery } from './webhook';

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
