import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { type CatalogSet, lockPath, readLock, renderLock, syncSet } from '@kromatv/i18n-tools';

type Files = Record<string, Record<string, string>>;

const made: string[] = [];

function setOf(files: Files, over: Partial<CatalogSet> = {}): CatalogSet {
  const dir = mkdtempSync(join(tmpdir(), 'kroma-i18n-devtools-'));
  made.push(dir);
  const set: CatalogSet = {
    name: 'core',
    dir,
    layout: 'folder',
    project: { source: 'fr' },
    ...over,
  };
  for (const [path, content] of Object.entries(files)) write(set, path, content);
  return set;
}

function write(set: CatalogSet, path: string, content: Record<string, string>): void {
  mkdirSync(dirname(join(set.dir, path)), { recursive: true });
  writeFileSync(join(set.dir, path), `${JSON.stringify(content, null, 2)}\n`);
}

export function read(set: CatalogSet, path: string): Record<string, string> {
  return JSON.parse(readFileSync(join(set.dir, path), 'utf8')) as Record<string, string>;
}

/** The app's set: French source, a namespace split into a folder, a plural
 *  with no base key, and an English that translates one message. */
export function app(): CatalogSet {
  return setOf({
    'fr/nav.json': { 'nav.home': 'Accueil', 'nav.hello': 'Bonjour {name}' },
    'fr/admin/backup.json': { 'admin.backup.run': 'Sauvegarder' },
    'fr/content.json': {
      'content.seasons_one': '{count} saison',
      'content.seasons_other': '{count} saisons',
    },
    'en/nav.json': { 'nav.home': 'Home' },
  });
}

/** A module's set: English source, one file per locale. */
export function vpn(): CatalogSet {
  return setOf(
    { 'en.json': { 'vpn.connect': 'Connect' }, 'fr.json': { 'vpn.connect': 'Connecter' } },
    { name: 'tv.kroma.vpn', layout: 'flat', project: { source: 'en' } },
  );
}

/** A set whose English has one message of each standing: `state.current`
 *  translated, `state.missing` not, `state.outdated` translated before its
 *  source moved, and `state.machine` written by a machine nobody has read. */
export function standing(): CatalogSet {
  const source = {
    'state.current': 'Actuel',
    'state.missing': 'Manquant',
    'state.outdated': 'Ancien',
    'state.machine': 'Automatique',
  };
  const set = setOf({
    'fr/state.json': source,
    'en/state.json': {
      'state.current': 'Current',
      'state.outdated': 'Old',
      'state.machine': 'Automatic',
    },
  });
  syncSet(set);
  write(set, 'fr/state.json', { ...source, 'state.outdated': 'Ancien, revu' });
  const lock = readLock(lockPath(set, 'en'));
  const entry = lock.get('state.machine');
  if (entry) lock.set('state.machine', { ...entry, machine: true });
  writeFileSync(lockPath(set, 'en'), renderLock(lock));
  return set;
}

export function removeSets(): void {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
}
