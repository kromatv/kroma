import { addLocale, type CatalogSet, confirm, fill, syncSet } from '@kromatv/i18n-tools';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { Store } from '#site/store/store';
import {
  ada,
  changed,
  markMachine,
  projectOnDisk,
  removeProjects,
  ROOT,
  rowsOf,
  sendAs,
  storeHolding,
  write,
} from './fixture';
import { noreplyEmail } from './propose';
import { type FakeRepository, fakeGitHub, forkRoutes, sha } from './test-support';

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

const send = (store: Store, gh: ReturnType<typeof fakeGitHub>, locale = 'en') =>
  sendAs({ gh, wait: async () => {} }, store, locale);

const fork = (locale: string, head?: string): FakeRepository => ({
  routes: forkRoutes({
    upstream: 'o/r',
    repo: 'Ada/r',
    branch: `lingua/${locale}`,
    made: true,
    head,
  }),
});

const TreeBody = z.object({ tree: z.array(z.object({ path: z.string(), content: z.string() })) });

function committed(gh: ReturnType<typeof fakeGitHub>) {
  const body = gh.calls.find((c) => c.path === '/repos/Ada/r/git/trees')?.body;
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

    const gh = fakeGitHub(fork('en'));

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

    const gh = fakeGitHub(fork('en'));

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

    const gh = fakeGitHub(fork('de'));

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

    const outcome = await send(store, fakeGitHub(fork('es')), 'es');

    expect(outcome).toEqual({ kind: 'incomplete', keys: ['nav.count'] });
  });

  it('catches an existing branch up with the default branch and builds on what it holds', async () => {
    const rows = rowsOf(repository());
    const store = await storeHolding(rows, { edits: { 'nav.count_one': '{count} movie' } });
    await store.saveProposal({
      project: 'o/r',
      userId: 42,
      locale: 'en',
      branch: 'ada:lingua/en',
      prNumber: 7,
      prUrl: 'https://github.com/o/r/pull/7',
      headSha: sha('9'),
      updatedAt: 1,
    });
    const onBranch =
      '{\n  "nav.home": "Home",\n  "nav.back": "Go back",\n  "nav.count": "{count} movies"\n}\n';
    const gh = fakeGitHub({
      routes: {
        ...fork('en', sha('9')).routes,
        'GET /repos/o/r/pulls?state=open&head=Ada:lingua%2Fen': () => [
          { number: 7, html_url: 'https://github.com/o/r/pull/7' },
        ],
      },
      blobs: { [sha('8')]: onBranch },
      paths: {
        ...Object.fromEntries(rows.map((row) => [`${sha('9')}:${row.path}`, row.blobSha])),
        [`${sha('9')}:${ROOT}/en/nav.json`]: sha('8'),
      },
    });

    await send(store, gh);

    expect(gh.calls.find((c) => c.path === '/repos/Ada/r/merges')?.body).toMatchObject({
      base: 'lingua/en',
      head: sha('a'),
    });
    expect(gh.calls.find((c) => c.path === '/repos/Ada/r/git/commits')?.body).toMatchObject({
      parents: [sha('9')],
    });
    expect(committed(gh).find((f) => f.path === `${ROOT}/en/nav.json`)?.content).toBe(
      '{\n  "nav.home": "Home",\n  "nav.back": "Go back",\n  "nav.count": "{count} movies",\n  "nav.count_one": "{count} movie"\n}\n',
    );
    expect(gh.calls.some((c) => c.method === 'POST' && c.path === '/repos/o/r/pulls')).toBe(false);
  });

  it('sends nothing and drops the work when the default branch already says the same', async () => {
    const store = await storeHolding(rowsOf(repository()), { edits: { 'nav.home': 'Home' } });

    const outcome = await send(store, fakeGitHub(fork('en')));

    expect(outcome).toEqual({ kind: 'nothing' });
    expect(await store.edits('o/r', ada.id, 'en')).toEqual([]);
  });
});

describe('naming', () => {
  it('credits commits to the address GitHub keeps private', () => {
    expect(noreplyEmail({ id: 1, login: 'x' })).toBe('1+x@users.noreply.github.com');
  });
});
