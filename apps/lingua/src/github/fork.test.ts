import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FileRow } from '#site/store/store';
import { ada, projectOnDisk, removeProjects, rowsOf, sendAs, storeHolding } from './fixture';
import { type Forking, ForkPending } from './fork';
import { type Call, type Fork, fakeGitHub, forkRoutes, sha } from './test-support';

const FORK: Fork = { upstream: 'o/r', repo: 'Ada/r', branch: 'lingua/en' };
const CREDIT = { name: 'Ada L.', email: '42+Ada@users.noreply.github.com' };
const REF = '/repos/Ada/r/git/refs/heads/lingua/en';

type Fake = ReturnType<typeof fakeGitHub>;

const project = () =>
  rowsOf(
    projectOnDisk({
      'i18n.json': '{ "source": "fr", "locales": { "en": { "stage": "stable" } } }\n',
      'fr/nav.json': { 'nav.home': 'Accueil', 'nav.back': 'Retour' },
      'en/nav.json': { 'nav.home': 'Home' },
    }),
  );

const through = (gh: Fake): Forking => ({ gh, wait: async () => {} });

const isWrite = (call: Call) => call.method !== 'GET' && call.method !== 'GRAPHQL';

const writes = (gh: Fake) => gh.calls.filter(isWrite).map((c) => `${c.method} ${c.path}`);

const bodyOf = (gh: Fake, write: string) =>
  [...gh.calls].reverse().find((c) => `${c.method} ${c.path}` === write)?.body;

const pathsAt = (commit: string, rows: readonly FileRow[]) =>
  Object.fromEntries(rows.map((row) => [`${commit}:${row.path}`, row.blobSha]));

afterEach(removeProjects);

describe('propose through a fork', () => {
  it('forks the project, levels the fork, and opens the pull request from it', async () => {
    const store = await storeHolding(project(), { edits: { 'nav.back': 'Back' } });
    const gh = fakeGitHub({ routes: forkRoutes(FORK) });

    const outcome = await sendAs(through(gh), store);

    expect(writes(gh)).toEqual([
      'POST /repos/o/r/forks',
      'POST /repos/Ada/r/merge-upstream',
      'POST /repos/Ada/r/git/trees',
      'POST /repos/Ada/r/git/commits',
      'POST /repos/Ada/r/git/refs',
      'POST /repos/o/r/pulls',
    ]);
    expect(bodyOf(gh, 'POST /repos/Ada/r/merge-upstream')).toEqual({ branch: 'main' });
    expect(bodyOf(gh, 'POST /repos/Ada/r/git/commits')).toMatchObject({
      parents: [sha('a')],
      author: CREDIT,
      committer: CREDIT,
    });
    expect(bodyOf(gh, 'POST /repos/Ada/r/git/refs')).toEqual({
      ref: 'refs/heads/lingua/en',
      sha: sha('1'),
    });
    expect(bodyOf(gh, 'POST /repos/o/r/pulls')).toMatchObject({
      head: 'ada:lingua/en',
      base: 'main',
      maintainer_can_modify: true,
    });
    expect(outcome).toMatchObject({
      kind: 'proposed',
      proposal: { branch: 'ada:lingua/en', prNumber: 9, headSha: sha('1') },
    });
  });

  it('adds a commit to the fork branch on the next send and keeps its pull request', async () => {
    const rows = project();
    const store = await storeHolding(rows, { edits: { 'nav.back': 'Back' } });
    const gh = fakeGitHub({ routes: forkRoutes(FORK), paths: pathsAt(sha('1'), rows) });
    await sendAs(through(gh), store);
    await store.putEdit({
      project: 'o/r',
      userId: ada.id,
      locale: 'en',
      file: 'nav',
      key: 'nav.home',
      value: 'Start',
      proposed: false,
      updatedAt: 2,
    });

    const outcome = await sendAs(through(gh), store);

    expect(writes(gh).filter((w) => w.endsWith('/forks') || w.endsWith('/pulls'))).toEqual([
      'POST /repos/o/r/forks',
      'POST /repos/o/r/pulls',
    ]);
    expect(bodyOf(gh, 'POST /repos/Ada/r/merges')).toMatchObject({
      base: 'lingua/en',
      head: sha('a'),
    });
    expect(bodyOf(gh, 'POST /repos/Ada/r/git/commits')).toMatchObject({ parents: [sha('1')] });
    expect(bodyOf(gh, `PATCH ${REF}`)).toEqual({ sha: sha('2'), force: false });
    expect(outcome).toMatchObject({
      kind: 'proposed',
      proposal: { prNumber: 9, headSha: sha('2') },
    });
  });

  it('starts a branch left behind by a closed pull request over from the default branch', async () => {
    const store = await storeHolding(project(), { edits: { 'nav.back': 'Back' } });
    const gh = fakeGitHub({ routes: forkRoutes({ ...FORK, made: true, head: sha('9') }) });

    await sendAs(through(gh), store);

    expect(writes(gh)).not.toContain('POST /repos/Ada/r/merges');
    expect(bodyOf(gh, 'POST /repos/Ada/r/git/commits')).toMatchObject({ parents: [sha('a')] });
    expect(bodyOf(gh, `PATCH ${REF}`)).toEqual({ sha: sha('1'), force: true });
  });

  it('gives up after ten looks at a fork GitHub has not finished making', async () => {
    const store = await storeHolding(project(), { edits: { 'nav.back': 'Back' } });
    const wait = vi.fn(async () => {});
    const gh = fakeGitHub({
      routes: { 'POST /repos/o/r/forks': () => ({ full_name: 'Ada/r', fork: true }) },
    });

    const sending = sendAs({ gh, wait }, store);

    await expect(sending).rejects.toBeInstanceOf(ForkPending);
    expect(wait).toHaveBeenCalledTimes(9);
  });
});
