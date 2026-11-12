import type { MessageKey, Translate } from '@kromatv/i18n';
import type {
  Access,
  PermissionCategory,
  PermissionGroup,
} from '#web/features/admin/module-permissions';
import {
  accessWord,
  accountWord,
  byAccountWeight,
  listOf,
  opening,
  settingWord,
  tableWord,
  type Word,
} from '#web/features/admin/module-permissions-words';

const NAMES_SHOWN = 2;
const NAMES_IN_BRIEF = 1;
const ACCESS_KINDS = [
  { reads: true, writes: true },
  { reads: false, writes: true },
  { reads: true, writes: false },
] as const;

interface Reached {
  word: Word;
  reads: boolean;
  writes: boolean;
}

function reached(access: Access | null | undefined, wordOf: (entry: string) => Word | null) {
  const byText = new Map<string, Reached>();
  const visit = (entries: readonly string[] | null | undefined, writes: boolean) => {
    for (const entry of entries ?? []) {
      const word = wordOf(entry);
      if (!word) continue;
      const seen = byText.get(word.text) ?? { word, reads: false, writes: false };
      if (writes) seen.writes = true;
      else seen.reads = true;
      byText.set(word.text, seen);
    }
  };
  visit(access?.read, false);
  visit(access?.write, true);
  return [...byText.values()];
}

function byAccess(items: readonly Reached[], t: Translate) {
  const ordered = [...items].sort((a, b) => Number(b.word.named) - Number(a.word.named));
  return ACCESS_KINDS.flatMap(({ reads, writes }) => {
    const alike = ordered.filter((item) => item.reads === reads && item.writes === writes);
    const [first] = alike;
    if (!first) return [];
    const said = listOf(
      alike.map((item) => item.word.text),
      t,
    );
    return [{ text: first.word.named ? opening(said) : said, hint: accessWord(reads, writes, t) }];
  });
}

function nounGroup(
  category: PermissionCategory,
  items: readonly Reached[],
  unnamed: MessageKey,
  t: Translate,
): PermissionGroup | null {
  if (items.length === 0) return null;
  const named = items.filter((item) => item.word.named).map((item) => item.word.text);
  const rest = items.length - named.length;
  const said = (shown: number) =>
    named.length > 0 ? opening(listOf(named, t, shown, rest)) : t(unnamed, { count: items.length });
  return {
    category,
    summary: said(NAMES_SHOWN),
    brief: said(NAMES_IN_BRIEF),
    details: byAccess(items, t),
    extended: false,
    access: items.some((item) => item.writes) ? 'write' : 'read',
  };
}

/** What a module reads or changes about the people on the server: their
 *  account, their history, their sessions. */
export function accountsGroup(core: Access | null | undefined, t: Translate) {
  const weighed = {
    read: [...(core?.read ?? [])].sort(byAccountWeight),
    write: [...(core?.write ?? [])].sort(byAccountWeight),
  };
  const items = reached(weighed, (entry) => accountWord(entry, t));
  return nounGroup('accounts', items, 'modulePermissions.accountsUnnamed', t);
}

/** The rest of the server's database a module reaches: the catalog, requests,
 *  downloads, and tables the core has no word for. */
export function dataGroup(core: Access | null | undefined, t: Translate) {
  const items = reached(core, (entry) => (accountWord(entry, t) ? null : tableWord(entry, t)));
  return nounGroup('data', items, 'modulePermissions.dataUnnamed', t);
}

/** The server settings a module reads or changes, and the environment
 *  variables it is handed. */
export function settingsGroup(
  settings: Access | null | undefined,
  env: readonly string[] | undefined,
  t: Translate,
): PermissionGroup | null {
  const variables = env ?? [];
  const items = reached(settings, (key) => settingWord(key, t));
  const group = nounGroup('settings', items, 'modulePermissions.settingsUnnamed', t);
  if (variables.length === 0) return group;
  const envDetails = variables.map((name) => ({
    text: name,
    hint: t('modulePermissions.envHint'),
  }));
  if (group) return { ...group, details: [...group.details, ...envDetails] };
  const summary = t('modulePermissions.envSummary', { count: variables.length });
  return {
    category: 'settings',
    summary,
    brief: summary,
    details: envDetails,
    extended: false,
    access: 'read',
  };
}
