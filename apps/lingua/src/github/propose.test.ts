import { addLocale, type CatalogSet, confirm, fill, syncSet } from '@kromatv/i18n-tools';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { memoryStore } from '#site/store/memory-store';
import type { FileRow, Store, User } from '#site/store/store';
import {
  changed,
  markMachine,
  projectOnDisk,
  removeProjects,
  ROOT,
  rowsOf,
  write,
} from './fixture';
import { branchFor, noreplyEmail, propose } from './propose';
import { type FakeRepository, fakeGitHub, sha } from './test-support';

const ada: User = { id: 42, login: 'Ada', name: 'Ada L.', avatarUrl: null };
const BRANCH = 'lingua/ada/en';
const CONFIG = JSON.stringify({ projects: [{ path: ROOT }] });

const POLICY =
  '{\n  "source": "fr",\n  "fallback": "en",\n  "locales": {\n    "en": { "stage": "stable" },\n    "es": { "stage": "beta" }\n  }\n}\n';

function repository(): CatalogSet {
  const set = projectOnDisk({
    'i18n.json': POLICY,
    'fr/lang.json': { 'lang.en': 'Anglais', 'lang.es': 'Espagnol', 'lang.fr': 'Français' },
    'fr/nav.json': {
      'nav.home': 'Accueil',
      'nav.back': 'Retour',
      'nav.count': '{count} films',
      'nav.count_one': '{count} film',
    },
    'fr/admin.json': { 'admin.title': 'Administration' },
    'fr/admin/backup.json': { 'admin.backup.title': 'Sauvegarde', 'admin.backup.run': 'Lancer' },
    'en/lang.json': { 'lang.en': 'English', 'lang.es': 'Spanish', 'lang.fr': 'French' },
    'en/nav.json': { 'nav.home': 'Home', 'nav.count': '{count} movies' },
    'en/admin/backup.json': { 'admin.backup.title': 'Backup', 'admin.backup.run': 'Run' },
    'es/lang.json': { 'lang.es': 'Español' },
  });
  markMachine(set, 'en', ['nav.home']);
  write(set, 'fr/admin/backup.json', {
    'admin.backup.title': 'Sauvegardes',
    'admin.backup.run': 'Lancer',
  });
  return set;
}

interface Work {
  locale?: string;
  edits?: Record<string, string>;
  confirms?: string[];
  start?: boolean;
}

async function storeHolding(rows: readonly FileRow[], work: Work): Promise<Store> {
  const store = memoryStore();
  const mine = { project: 'o/r', userId: ada.id, locale: work.locale ?? 'en', proposed: false };
  await store.upsertProject('o/r', 1, 'main');
  await store.setSynced('o/r', {
    headSha: sha('a'),
    treeSha: sha('0e'),
    config: CONFIG,
    configError: null,
    at: 1,
  });
  await store.replaceFiles('o/r', rows, []);
  await Promise.all([
    ...Object.entries(work.edits ?? {}).map(([key, value]) =>
      store.putEdit({ ...mine, file: key.split('.')[0] ?? '', key, value, updatedAt: 1 }),
    ),
    ...(work.confirms ?? []).map((key) => store.putConfirm({ ...mine, key, updatedAt: 1 })),
    ...(work.start ? [store.putStart({ ...mine, createdAt: 1 })] : []),
  ]);
  return store;
}

async function send(store: Store, gh: ReturnType<typeof fakeGitHub>, locale = 'en') {
  const project = await store.project('o/r');
  if (!project) {
    throw new Error('the project was not seeded');
  }
  const files = await store.files('o/r');
  return propose(gh, store, {
    project,
    root: ROOT,
    files,
    user: ada,
    locale,
    origin: 'https://lingua.test',
    now: 1_800_000_000,
  });
}

const pulls = (branch: string) =>
  `GET /repos/o/r/pulls?state=open&head=o:${encodeURIComponent(branch)}`;

const newBranch = (branch: string): FakeRepository => ({
  routes: {
    'POST /repos/o/r/git/trees': () => ({ sha: sha('e') }),
    'POST /repos/o/r/git/commits': () => ({ sha: sha('f') }),
    'POST /repos/o/r/git/refs': () => ({}),
    [pulls(branch)]: () => [],
    'POST /repos/o/r/pulls': () => ({ number: 7, html_url: 'https://github.com/o/r/pull/7' }),
  },
});

const TreeBody = z.object({ tree: z.array(z.object({ path: z.string(), content: z.string() })) });

function committed(gh: ReturnType<typeof fakeGitHub>) {
  const body = gh.calls.find((c) => c.path === '/repos/o/r/git/trees')?.body;
  return TreeBody.parse(body).tree.map(({ path, content }) => ({ path, content }));
}

afterEach(removeProjects);

describe('propose', () => {
  it('commits the files and the lock i18n-tools writes for the same edits and confirm', async () => {
    const edits = {
      'nav.back': 'Back',
      'nav.count_one': '{count} movie',
      'admin.title': 'Administration',
    };
    const set = repository();
    const store = await storeHolding(rowsOf(set), { edits, confirms: ['admin.backup.title'] });
    const before = rowsOf(set);
    fill(set, 'en', edits);
    syncSet(set);
    confirm(set, 'en', ['admin.backup.title']);

    const gh = fakeGitHub(newBranch(BRANCH));

    await send(store, gh);

    expect(committed(gh)).toEqual(changed(before, rowsOf(set)));
    expect(committed(gh).find((f) => f.path === `${ROOT}/en/i18n.lock`)?.content).toMatch(
      /"nav\.home": "[0-9a-f]{8} [0-9a-f]{8} mt"/,
    );
  });

  it('confirms an outdated message in a commit that only rewrites the lock', async () => {
    const set = repository();
    const store = await storeHolding(rowsOf(set), { confirms: ['admin.backup.title'] });
    const before = rowsOf(set);
    confirm(set, 'en', ['admin.backup.title']);

    const gh = fakeGitHub(newBranch(BRANCH));

    const outcome = await send(store, gh);

    expect(committed(gh)).toEqual(changed(before, rowsOf(set)));
    expect(committed(gh).map((f) => f.path)).toEqual([`${ROOT}/en/i18n.lock`]);
    expect(outcome.kind).toBe('proposed');
  });

  it('starts a language as i18n add does, and lists it in i18n.json as a draft', async () => {
    const set = repository();
    const store = await storeHolding(rowsOf(set), {
      locale: 'de',
      edits: { 'nav.home': 'Startseite' },
      start: true,
    });
    const before = rowsOf(set);
    addLocale(set, 'de');
    fill(set, 'de', { 'nav.home': 'Startseite' });
    syncSet(set);

    const gh = fakeGitHub(newBranch('lingua/ada/de'));

    await send(store, gh, 'de');

    const files = committed(gh);
    expect(files.filter((f) => f.path !== `${ROOT}/i18n.json`)).toEqual(
      changed(before, rowsOf(set)),
    );
    expect(files.find((f) => f.path === `${ROOT}/i18n.json`)?.content).toBe(
      POLICY.replace(
        '{ "stage": "beta" }\n',
        '{ "stage": "beta" },\n    "de": { "stage": "draft" }\n',
      ),
    );
  });

  it('refuses plural forms sent without their general form', async () => {
    const store = await storeHolding(rowsOf(repository()), {
      locale: 'es',
      edits: { 'nav.count_one': '{count} película' },
    });

    const outcome = await send(store, fakeGitHub(newBranch('lingua/ada/es')), 'es');

    expect(outcome).toEqual({ kind: 'incomplete', keys: ['nav.count'] });
  });

  it('opens the pull request from the App, crediting the commit to the contributor', async () => {
    const store = await storeHolding(rowsOf(repository()), { edits: { 'nav.back': 'Back' } });
    const gh = fakeGitHub(newBranch(BRANCH));

    const outcome = await send(store, gh);

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
    expect((await store.edits('o/r', ada.id, 'en')).every((e) => e.proposed)).toBe(true);
  });

  it('catches an existing branch up with the default branch and builds on what it holds', async () => {
    const rows = rowsOf(repository());
    const store = await storeHolding(rows, { edits: { 'nav.count_one': '{count} movie' } });
    const onBranch =
      '{\n  "nav.home": "Home",\n  "nav.back": "Go back",\n  "nav.count": "{count} movies"\n}\n';
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
        [pulls(BRANCH)]: () => [{ number: 7, html_url: 'https://github.com/o/r/pull/7' }],
      },
      blobs: { [sha('9')]: onBranch },
      paths: {
        ...Object.fromEntries(rows.map((row) => [`${sha('b')}:${row.path}`, row.blobSha])),
        [`${sha('b')}:${ROOT}/en/nav.json`]: sha('9'),
      },
    });

    await send(store, gh);

    expect(gh.calls.find((c) => c.path === '/repos/o/r/merges')?.body).toMatchObject({
      base: BRANCH,
      head: sha('a'),
    });
    expect(gh.calls.find((c) => c.path === '/repos/o/r/git/commits')?.body).toMatchObject({
      parents: [sha('b')],
    });
    expect(committed(gh).find((f) => f.path === `${ROOT}/en/nav.json`)?.content).toBe(
      '{\n  "nav.home": "Home",\n  "nav.back": "Go back",\n  "nav.count": "{count} movies",\n  "nav.count_one": "{count} movie"\n}\n',
    );
    expect(gh.calls.some((c) => c.method === 'POST' && c.path === '/repos/o/r/pulls')).toBe(false);
  });

  it('sends nothing and drops the work when the default branch already says the same', async () => {
    const store = await storeHolding(rowsOf(repository()), { edits: { 'nav.home': 'Home' } });

    const outcome = await send(store, fakeGitHub({ routes: {} }));

    expect(outcome).toEqual({ kind: 'nothing' });
    expect(await store.edits('o/r', ada.id, 'en')).toEqual([]);
  });
});

describe('naming', () => {
  it('gives each contributor one branch per language', () => {
    expect(branchFor('Ada', 'pt-BR')).toBe('lingua/ada/pt-BR');
  });

  it('credits commits to the address GitHub keeps private', () => {
    expect(noreplyEmail({ id: 1, login: 'x' })).toBe('1+x@users.noreply.github.com');
  });
});
