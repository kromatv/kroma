// The registry: where a story sits, how the list is ordered, and how it is
// searched. Everything here reads a story rather than building one.

import type { IconName } from '@kroma/ui/kit';
import type { Story } from './story';

function slug(name: string): string {
  return (
    name
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      // Strip diacritics before the alphanumeric filter: "Icônes" must
      // deep-link as ?story=icones, not ?story=ic-nes.
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  );
}

interface Searchable {
  name: string;
  group: string;
  tier?: string;
  summary?: string;
}

// A section's glyph, so the tree and the palette name a group the same way.
// Beside the group order rather than in either consumer: two copies would drift
// the moment a section is added.
const GROUP_GLYPH: Record<string, IconName> = {
  Guides: 'book',
  Foundations: 'palette',
  Layout: 'layout',
  Actions: 'pointer',
  Input: 'forms',
  Overlays: 'stack-2',
  Feedback: 'progress',
  Media: 'photo',
  Player: 'player-play',
  Brand: 'diamond',
};

/** The glyph naming a section, falling back to a neutral mark. */
function glyphFor(group: string): IconName {
  return GROUP_GLYPH[group] ?? 'square';
}

/** Case-insensitive match on everything the row says about itself. Takes the
 * shape rather than a `Story`, so an article is searched the same way. */
function matches(entry: Searchable, query: string): boolean {
  if (!query) return true;
  const needle = query.toLowerCase();
  return [entry.name, entry.group, entry.tier, entry.summary].some((field) =>
    (field ?? '').toLowerCase().includes(needle),
  );
}

/** Sidebar order; any group not listed follows alphabetically. One flat list
 * of FUNCTIONAL groups: what a component is for, never which atomic level it
 * happens to live at - the levels are for the people editing the kit, and a
 * tree that nested them made every kind of input land in three places. */
const GROUP_ORDER = [
  'Foundations',
  'Layout',
  'Actions',
  'Input',
  'Overlays',
  'Feedback',
  'Media',
  'Player',
  'Brand',
];

const TIER_ORDER = ['Foundations', 'Atoms', 'Molecules', 'Organisms', 'Templates'];

/** Which atomic level a story belongs to, read from where its file sits. */
function tierFor(path: string): string {
  const at = /\/components\/(atoms|molecules|organisms|templates)\//.exec(path);
  if (at?.[1]) return `${at[1].charAt(0).toUpperCase()}${at[1].slice(1)}`;
  if (path.includes('/foundations/')) return 'Foundations';
  return 'Other';
}

/** Compares two strings by their code units. Deliberately not `localeCompare`:
 * that orders by the host's locale, so the same tree would sort differently on
 * a laptop than in CI. */
function byText(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/** The discovered paths of one kind, sorted - always: a story's tier is read
 * from its path, so paths and stories must stay lined up regardless of the
 * bundler's enumeration order. */
function pathsEnding(paths: readonly string[], suffix: string): string[] {
  return paths.filter((path) => path.endsWith(suffix)).sort(byText);
}

/** The distinct values of `key` with the items that carry them, in encounter
 * order, which, after `orderStories`, is already the sorted order. */
function groupBy<T, K>(items: readonly T[], key: (item: T) => K): { key: K; items: T[] }[] {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const at = key(item);
    const bucket = out.get(at);
    if (bucket) bucket.push(item);
    else out.set(at, [item]);
  }
  return [...out].map(([at, entries]) => ({ key: at, items: entries }));
}

/** Attach the level each story's file implies. */
function attachTiers(stories: readonly Story[], paths: readonly string[]): Story[] {
  return stories.map((entry, at) => ({ ...entry, tier: tierFor(paths[at] ?? '') }));
}

/** Sorts the registry for display: by functional group, then name. The atomic
 * level stays attached (search matches it, the palette shows it) but never
 * drives the order a reader scans. Takes the two fields it reads rather than a
 * `Story`, so an INDEX of stories is ordered by the same arithmetic. */
function orderStories<T extends { group: string; name: string }>(stories: readonly T[]): T[] {
  const rankOf = (order: readonly string[], value: string) => {
    const at = order.indexOf(value);
    return at === -1 ? order.length : at;
  };
  return [...stories].sort(
    (a, b) =>
      rankOf(GROUP_ORDER, a.group) - rankOf(GROUP_ORDER, b.group) ||
      a.group.localeCompare(b.group) ||
      a.name.localeCompare(b.name),
  );
}

export {
  attachTiers,
  byText,
  GROUP_ORDER,
  glyphFor,
  groupBy,
  matches,
  orderStories,
  pathsEnding,
  slug,
  TIER_ORDER,
  tierFor,
};
