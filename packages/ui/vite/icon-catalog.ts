import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const VIRTUAL = 'virtual:kroma-icon-catalog';

// Rollup's convention for "this id belongs to a plugin, do not touch it".
const RESOLVED = `\0${VIRTUAL}`;

interface CatalogPlugin {
  name: string;
  resolveId(id: string): string | null;
  load(id: string): string | null;
}

// Tabler writes a numeric tag unquoted (`a-b-2` is tagged `2`), and four
// glyphs carry a null one; anything else it ever writes there drops out.
const Tag = z.union([z.string(), z.number()]).catch('');

const Entry = z.object({
  category: z.string(),
  tags: z.array(Tag).default([]),
});

const Catalog = z.record(z.string(), z.unknown());

// @tabler/icons publishes only `./icons/*` through its exports map, so the
// catalogue sitting beside them is reached from a glyph's own resolved path.
function catalogFile(): string {
  return fileURLToPath(
    new URL('../../icons.json', import.meta.resolve('@tabler/icons/outline/plus.svg')),
  );
}

// One malformed glyph costs that glyph its tags, never the workbench: this
// metadata is a search nicety, and a build that dies over it is a worse trade.
function readCatalog(): Record<string, { category: string; tags: string[] }> {
  const raw = Catalog.parse(JSON.parse(readFileSync(catalogFile(), 'utf8')));
  const catalog: Record<string, { category: string; tags: string[] }> = {};
  const skipped: string[] = [];
  for (const [name, value] of Object.entries(raw)) {
    const entry = Entry.safeParse(value);
    if (!entry.success) {
      skipped.push(name);
      continue;
    }
    catalog[name] = {
      category: entry.data.category,
      tags: entry.data.tags.map(String).filter(Boolean),
    };
  }
  if (skipped.length > 0) {
    console.warn(`[kroma:icon-catalog] ${skipped.length} glyphs have no usable metadata`);
  }
  return catalog;
}

function dictionary() {
  const at = new Map<string, number>();
  const words: string[] = [];
  return {
    words,
    of(word: string): number {
      const seen = at.get(word);
      if (seen !== undefined) return seen;
      at.set(word, words.length);
      words.push(word);
      return words.length - 1;
    },
  };
}

// Fifty thousand tag references over six thousand distinct tags, so the module
// ships the words once and the glyphs as indices into them: a tenth of the
// bytes of the expanded form, which the workbench's entry chunk carries.
function catalogSource(): string {
  const categories = dictionary();
  const tags = dictionary();
  const glyphs: Record<string, number[]> = {};
  for (const [name, entry] of Object.entries(readCatalog())) {
    glyphs[name] = [categories.of(entry.category), ...entry.tags.map((tag) => tags.of(tag))];
  }
  return [
    `const categories = ${JSON.stringify(categories.words)};`,
    `const tags = ${JSON.stringify(tags.words)};`,
    `const glyphs = ${JSON.stringify(glyphs)};`,
    'export const ICON_CATALOG = Object.fromEntries(',
    '  Object.entries(glyphs).map(([name, [category, ...tagged]]) => [',
    '    name,',
    '    { category: categories[category], tags: tagged.map((at) => tags[at]) },',
    '  ]),',
    ');',
  ].join('\n');
}

/**
 * Serves `virtual:kroma-icon-catalog` - Tabler's own category and tags for
 * every glyph, read at build time.
 *
 * For a WORKBENCH only. It is a megabyte of metadata that exists to make the
 * icon browser searchable by meaning, and no product bundle should carry it;
 * a shell that has not added this plugin fails to resolve the module rather
 * than shipping it by accident.
 */
export function kromaIconCatalog(): CatalogPlugin {
  return {
    name: 'kroma:icon-catalog',
    resolveId: (id) => (id === VIRTUAL ? RESOLVED : null),
    load: (id) => (id === RESOLVED ? catalogSource() : null),
  };
}
