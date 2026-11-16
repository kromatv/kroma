import { describe, expect, it } from 'vitest';
import { LinguaConfig } from '#site/core/config';
import { memoryStore } from '#site/store/memory-store';
import type { FileRow, Store, User } from '#site/store/store';
import { branchFor, noreplyEmail, propose } from './propose';
import { fakeGitHub, sha } from './test-support';

const config = LinguaConfig.parse({
  source: 'en',
  locales: ['fr'],
  catalogs: [{ path: 'loc/{locale}/{namespace}.json' }],
});
const ada: User = { id: 42, login: 'Ada', name: 'Ada L.', avatarUrl: null };
const BRANCH = 'lingua/ada/fr';

const files: FileRow[] = [
  {
    path: 'loc/en/nav.json',
    catalog: 0,
    locale: 'en',
    namespace: 'nav',
    blobSha: sha('1'),
    body: '{\n  "nav.home": "Home",\n  "nav.back": "Back"\n}\n',
  },
  {
    path: 'loc/fr/nav.json',
    catalog: 0,
    locale: 'fr',
    namespace: 'nav',
    blobSha: sha('2'),
    body: '{\n  "nav.home": "Acceuil"\n}\n',
  },
];

async function seeded(): Promise<Store> {
  const store = memoryStore();
  await store.upsertProject('o/r', 1, 'main');
  await store.setSynced('o/r', {
    headSha: sha('a'),
    treeSha: sha('0e'),
    config: JSON.stringify(config),
    configError: null,
    at: 1,
  });
  const edits = { 'nav.home': 'Accueil', 'nav.back': 'Retour' };
  await Promise.all(
    Object.entries(edits).map(([key, value]) =>
      store.putEdit({
        project: 'o/r',
        userId: ada.id,
        locale: 'fr',
        namespace: 'nav',
        key,
        value,
        proposed: false,
        updatedAt: 1,
      }),
    ),
  );
  return store;
}

async function send(store: Store, gh: ReturnType<typeof fakeGitHub>) {
  const project = await store.project('o/r');
  if (!project) {
    throw new Error('the project was not seeded');
  }
  return propose(gh, store, {
    project,
    config,
    files,
    user: ada,
    locale: 'fr',
    origin: 'https://lingua.test',
    now: 1_800_000_000,
  });
}

const pulls = `GET /repos/o/r/pulls?state=open&head=o:${encodeURIComponent(BRANCH)}`;

describe('propose', () => {
  it('opens a branch and a pull request whose commit is authored by the contributor', async () => {
    const store = await seeded();
    const gh = fakeGitHub({
      routes: {
        'POST /repos/o/r/git/trees': () => ({ sha: sha('e') }),
        'POST /repos/o/r/git/commits': () => ({ sha: sha('f') }),
        'POST /repos/o/r/git/refs': () => ({}),
        [pulls]: () => [],
        'POST /repos/o/r/pulls': () => ({ number: 7, html_url: 'https://github.com/o/r/pull/7' }),
      },
    });

    const outcome = await send(store, gh);

    const tree = gh.calls.find((c) => c.path === '/repos/o/r/git/trees')?.body;
    expect(tree).toEqual({
      base_tree: sha('0e'),
      tree: [
        {
          path: 'loc/fr/nav.json',
          mode: '100644',
          type: 'blob',
          content: '{\n  "nav.home": "Accueil",\n  "nav.back": "Retour"\n}\n',
        },
      ],
    });
    expect(gh.calls.find((c) => c.path === '/repos/o/r/git/commits')?.body).toMatchObject({
      parents: [sha('a')],
      author: { name: 'Ada L.', email: '42+Ada@users.noreply.github.com' },
    });
    expect(gh.calls.find((c) => c.path === '/repos/o/r/git/refs')?.body).toEqual({
      ref: `refs/heads/${BRANCH}`,
      sha: sha('f'),
    });
    expect(gh.calls.find((c) => c.path === '/repos/o/r/pulls')?.body).toMatchObject({
      head: BRANCH,
      base: 'main',
    });
    expect(outcome).toMatchObject({
      kind: 'proposed',
      proposal: { prNumber: 7, headSha: sha('f') },
    });
    expect((await store.edits('o/r', ada.id, 'fr')).every((e) => e.proposed)).toBe(true);
  });

  it('catches an existing branch up with the default branch and adds a commit to the open pull request', async () => {
    const store = await seeded();
    const gh = fakeGitHub({
      routes: {
        [`GET /repos/o/r/git/ref/heads/${BRANCH}`]: () => ({ object: { sha: sha('b') } }),
        'POST /repos/o/r/merges': () => null,
        [`GET /repos/o/r/git/commits/${sha('b')}`]: () => ({
          sha: sha('b'),
          tree: { sha: sha('0d') },
        }),
        'POST /repos/o/r/git/trees': () => ({ sha: sha('e') }),
        'POST /repos/o/r/git/commits': () => ({ sha: sha('f') }),
        [`PATCH /repos/o/r/git/refs/heads/${BRANCH}`]: () => ({}),
        [pulls]: () => [{ number: 7, html_url: 'https://github.com/o/r/pull/7' }],
      },
      blobs: { [sha('9')]: '{\n  "nav.home": "Accueil"\n}\n' },
      paths: { [`${sha('b')}:loc/fr/nav.json`]: sha('9') },
    });

    await send(store, gh);

    expect(gh.calls.find((c) => c.path === '/repos/o/r/merges')?.body).toMatchObject({
      base: BRANCH,
      head: sha('a'),
    });
    expect(gh.calls.find((c) => c.path === '/repos/o/r/git/commits')?.body).toMatchObject({
      parents: [sha('b')],
    });
    expect(gh.calls.find((c) => c.method === 'PATCH')?.body).toEqual({
      sha: sha('f'),
      force: false,
    });
    expect(gh.calls.some((c) => c.method === 'POST' && c.path === '/repos/o/r/pulls')).toBe(false);
  });

  it('sends nothing and drops the edits when the default branch already says the same', async () => {
    const store = memoryStore();
    await store.upsertProject('o/r', 1, 'main');
    await store.setSynced('o/r', {
      headSha: sha('a'),
      treeSha: sha('0e'),
      config: JSON.stringify(config),
      configError: null,
      at: 1,
    });
    await store.putEdit({
      project: 'o/r',
      userId: ada.id,
      locale: 'fr',
      namespace: 'nav',
      key: 'nav.home',
      value: 'Acceuil',
      proposed: false,
      updatedAt: 1,
    });
    const gh = fakeGitHub({ routes: {} });

    const outcome = await send(store, gh);

    expect(outcome).toEqual({ kind: 'nothing' });
    expect(await store.edits('o/r', ada.id, 'fr')).toEqual([]);
  });
});

describe('naming', () => {
  it('gives each contributor one branch per language', () => {
    expect(branchFor('Ada', 'pt-br')).toBe('lingua/ada/pt-br');
  });

  it('credits commits to the address GitHub keeps private', () => {
    expect(noreplyEmail({ id: 1, login: 'x' })).toBe('1+x@users.noreply.github.com');
  });
});
