import { placeOf } from '#site/core/config';
import { digest } from '#site/core/lock';
import { memoryStore } from '#site/store/memory-store';
import type { FileRow, Store, User } from '#site/store/store';
import type { Context } from './views';

/** The contributor every server test signs in as. */
export const ada: User = { id: 42, login: 'ada', name: null, avatarUrl: null };

const ROOT = 'loc';

async function lockText(): Promise<string> {
  const said = (key: string, text: string) => digest({ key, forms: { [key]: text } });
  const [play, title, sauvegarde] = await Promise.all([
    said('p.play', 'Lire {title}'),
    said('admin.backup.title', 'Backup'),
    said('admin.backup.title', 'Sauvegarde'),
  ]);
  const messages = { 'admin.backup.title': `${title} ${sauvegarde} mt`, 'p.play': `00000000 ${play}` };
  return `${JSON.stringify({ version: 1, messages }, null, 2)}\n`;
}

async function projectFiles(): Promise<Record<string, string>> {
  return {
    'i18n.json': JSON.stringify({ source: 'en', locales: { fr: { stage: 'stable' }, pl: {} } }),
    'notes.json': JSON.stringify({ '*': 'Informal.', 'p.': 'The player.', 'p.play': 'A verb.' }),
    'en/p.json': JSON.stringify({ 'p.play': 'Play {title}', 'p.n': '{count} items', 'p.n_one': 'One item' }),
    'en/admin/backup.json': JSON.stringify({ 'admin.backup.title': 'Backup', 'admin.backup.run': 'Run' }),
    'fr/p.json': JSON.stringify({ 'p.play': 'Lire {title}' }),
    'fr/admin/backup.json': JSON.stringify({ 'admin.backup.title': 'Sauvegarde' }),
    'fr/i18n.lock': await lockText(),
  };
}

/** A store holding project `o/r`, translated from English into a stable French and a draft Polish, with notes and a lock. */
export async function seededStore(): Promise<Store> {
  const store = memoryStore();
  await store.upsertProject({ id: 'o/r', branch: 'main', pinned: false });
  await store.setSynced('o/r', {
    headSha: 'h',
    treeSha: 't',
    config: JSON.stringify({ projects: [{ path: ROOT }] }),
    configError: null,
    at: 1,
  });
  const rows = Object.entries(await projectFiles()).flatMap(([below, body]): FileRow[] => {
    const path = `${ROOT}/${below}`;
    const place = placeOf(ROOT, path);
    return place ? [{ ...place, path, blobSha: 'x', body }] : [];
  });
  await store.replaceFiles('o/r', rows, []);
  return store;
}

/** The context a page is computed in, for `viewer`. */
export function pageContext(store: Store, viewer: User | null): Context {
  return { env: {}, store, viewer };
}
