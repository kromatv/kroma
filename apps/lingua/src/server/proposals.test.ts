import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitHubError } from '#site/github/client';
import { ada, type HeldWork, projectOnDisk, removeProjects, rowsOf, storeHolding } from '#site/github/fixture';
import { reader } from '#site/github/reader';
import { fakeGitHub, forkRoutes, gitHubFetch, sha } from '#site/github/test-support';
import type { Store } from '#site/store/store';
import { type ProposalInput, sendProposal } from './proposals';

const NOW = 1_800_000_000;

afterEach(() => {
  removeProjects();
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

const branchAt = (head: string, requests = 20) =>
  reader({ oauth: null, requests }, gitHubFetch({ routes: { 'GET /repos/o/r/commits/main': () => new Response(head) } }));

const contributor = (over: Record<string, () => unknown> = {}) =>
  fakeGitHub({ routes: { ...forkRoutes({ upstream: 'o/r', repo: 'Ada/r', branch: 'lingua/en', made: true }), ...over } });

const holding = (work: HeldWork = { edits: { 'nav.count': '{count} movies' } }) => storeHolding(project(), work);

const sending = (store: Store, input: Partial<ProposalInput> = {}, as = contributor(), read = branchAt(sha('a'))) =>
  sendProposal(store, { reader: read, user: ada, input: { project: 'o/r', locale: 'en', ...input }, origin: 'https://lingua.test', as }, NOW);

describe('sendProposal', () => {
  it('sends the contributor’s edits from their fork and answers with the pull request', async () => {
    const result = await sending(await holding());

    expect(result).toEqual({ status: 200, body: { kind: 'proposed', number: 9, url: 'https://github.com/o/r/pull/9' } });
  });

  it('refuses to send while Lingua is still reading the branch’s latest changes', async () => {
    const store = await holding();

    const result = await sending(store, {}, contributor(), branchAt(sha('b'), 2));

    expect(result).toMatchObject({ status: 503, reason: 'syncing' });
  });

  it('answers that there is nothing to send when the contributor holds no work', async () => {
    expect(await sending(await holding({}))).toEqual({ status: 200, body: { kind: 'nothing' } });
  });

  it('refuses plural forms sent without their general form', async () => {
    const result = await sending(await holding({ edits: { 'nav.count_one': '{count} movie' } }));

    expect(result).toMatchObject({ status: 422, reason: 'incomplete', error: expect.stringContaining('nav.count') });
  });

  it('refuses a second send within twenty seconds of the last', async () => {
    const store = await holding();
    await store.saveProposal({ project: 'o/r', userId: ada.id, locale: 'en', branch: 'b', prNumber: 7, prUrl: 'u', headSha: 'h', updatedAt: NOW - 5 });

    expect(await sending(store)).toMatchObject({ status: 429, reason: 'busy' });
  });

  it('refuses a project Lingua does not translate, or a language it does not offer', async () => {
    const store = await holding();

    const results = await Promise.all([sending(store, { project: 'x/y' }), sending(store, { locale: 'de' })]);

    expect(results.map((r) => r.status)).toEqual([404, 404]);
  });

  it('refuses a project whose lingua.json no longer reads', async () => {
    const store = await holding();
    await store.setSynced('o/r', { headSha: sha('a'), treeSha: sha('0e'), config: null, configError: 'lingua.json is missing', at: 2 });

    expect(await sending(store)).toMatchObject({ status: 404, reason: 'missing' });
  });

  it('answers a branch GitHub would not move as a conflict', async () => {
    const as = contributor({ 'POST /repos/Ada/r/git/refs': fails(409) });

    expect(await sending(await holding(), {}, as)).toMatchObject({ status: 409, reason: 'conflict' });
  });

  it('answers a fork whose default branch diverged from the project’s', async () => {
    const as = contributor({ 'POST /repos/Ada/r/merge-upstream': fails(409) });

    expect(await sending(await holding(), {}, as)).toMatchObject({ status: 409, reason: 'diverged' });
  });

  it('answers any other failure as failed, and logs it', async () => {
    const as = contributor({ 'POST /repos/Ada/r/git/trees': fails(500) });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(await sending(await holding(), {}, as)).toMatchObject({ status: 502, reason: 'failed' });
    expect(logged).toHaveBeenCalledWith('lingua: proposal failed', expect.any(GitHubError));
  });
});
