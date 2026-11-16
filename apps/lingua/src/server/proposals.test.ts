import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AppCredentials } from '#site/github/app';
import { GitHubError } from '#site/github/client';
import { ada, type HeldWork, projectOnDisk, removeProjects, rowsOf, storeHolding } from '#site/github/fixture';
import { fakeGitHub, forkRoutes, gitHubFetch, sha, testApp } from '#site/github/test-support';
import type { Store } from '#site/store/store';
import { type ProposalInput, sendProposal } from './proposals';

const NOW = 1_800_000_000;

let app: AppCredentials;

beforeAll(() => {
  app = testApp();
}, 60_000);

afterEach(() => {
  removeProjects();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const project = () =>
  rowsOf(
    projectOnDisk({
      'i18n.json': '{ "source": "fr", "locales": { "en": { "stage": "stable" } } }\n',
      'fr/nav.json': { 'nav.home': 'Accueil', 'nav.count': '{count} films', 'nav.count_one': '{count} film' },
      'en/nav.json': { 'nav.home': 'Home' },
    }),
  );

const fails = (status: number) => () => {
  throw new GitHubError(status, 'refused');
};

function gitHubServing(over: Record<string, () => unknown> = {}) {
  const fetchFn = gitHubFetch({
    routes: {
      'POST /app/installations/1/access_tokens': () => ({ token: 'ghs_x', expires_at: new Date(NOW * 2000).toISOString() }),
      'GET /repos/o/r/branches/main': () => ({ commit: { sha: sha('a'), commit: { tree: { sha: sha('0e') } } } }),
      'POST /repos/o/r/git/trees': () => ({ sha: sha('e') }),
      'POST /repos/o/r/git/commits': () => ({ sha: sha('f') }),
      'POST /repos/o/r/git/refs': () => ({}),
      'GET /repos/o/r/pulls?state=open&head=o:lingua%2Fada%2Fen': () => [],
      'POST /repos/o/r/pulls': () => ({ number: 7, html_url: 'https://github.com/o/r/pull/7' }),
      ...over,
    },
  });
  vi.stubGlobal('fetch', fetchFn);
  return fetchFn;
}

const holding = (work: HeldWork = { edits: { 'nav.count': '{count} movies' } }) => storeHolding(project(), work);

const sending = (store: Store, input: Partial<ProposalInput> = {}, as?: ReturnType<typeof fakeGitHub>) =>
  sendProposal(store, { app, user: ada, input: { project: 'o/r', locale: 'en', ...input }, origin: 'https://lingua.test', as }, NOW);

describe('sendProposal', () => {
  it('sends the contributor’s edits through the App and answers with the pull request', async () => {
    gitHubServing();

    const result = await sending(await holding());

    expect(result).toEqual({ status: 200, body: { kind: 'proposed', number: 7, url: 'https://github.com/o/r/pull/7' } });
  });

  it('answers that there is nothing to send when the contributor holds no work', async () => {
    gitHubServing();

    expect(await sending(await holding({}))).toEqual({ status: 200, body: { kind: 'nothing' } });
  });

  it('refuses plural forms sent without their general form', async () => {
    gitHubServing();

    const result = await sending(await holding({ edits: { 'nav.count_one': '{count} movie' } }));

    expect(result).toMatchObject({ status: 422, reason: 'incomplete', error: expect.stringContaining('nav.count') });
  });

  it('refuses a second send within twenty seconds of the last', async () => {
    const store = await holding();
    await store.saveProposal({ project: 'o/r', userId: ada.id, locale: 'en', branch: 'b', prNumber: 7, prUrl: 'u', headSha: 'h', updatedAt: NOW - 5 });

    expect(await sending(store)).toMatchObject({ status: 429, reason: 'busy' });
  });

  it('refuses a project Lingua does not translate, or a language it does not offer', async () => {
    gitHubServing();
    const store = await holding();

    const results = await Promise.all([sending(store, { project: 'x/y' }), sending(store, { locale: 'de' })]);

    expect(results.map((r) => r.status)).toEqual([404, 404]);
  });

  it('refuses a project whose lingua.json no longer reads', async () => {
    gitHubServing();
    const store = await holding();
    await store.setSynced('o/r', { headSha: sha('a'), treeSha: sha('0e'), config: null, configError: 'lingua.json is missing', at: 2 });

    expect(await sending(store)).toMatchObject({ status: 404, reason: 'missing' });
  });

  it('answers a branch GitHub would not move as a conflict', async () => {
    gitHubServing({ 'POST /repos/o/r/git/refs': fails(409) });

    expect(await sending(await holding())).toMatchObject({ status: 409, reason: 'conflict' });
  });

  it('answers a fork whose default branch diverged from the project’s', async () => {
    gitHubServing();
    const fork = forkRoutes({ upstream: 'o/r', repo: 'Ada/r', branch: 'lingua/en', made: true });
    const contributor = fakeGitHub({ routes: { ...fork, 'POST /repos/Ada/r/merge-upstream': fails(409) } });

    expect(await sending(await holding(), {}, contributor)).toMatchObject({ status: 409, reason: 'diverged' });
  });

  it('answers any other failure as failed, and logs it', async () => {
    gitHubServing({ 'POST /repos/o/r/git/trees': fails(500) });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(await sending(await holding())).toMatchObject({ status: 502, reason: 'failed' });
    expect(logged).toHaveBeenCalledWith('lingua: proposal failed', expect.any(GitHubError));
  });
});
