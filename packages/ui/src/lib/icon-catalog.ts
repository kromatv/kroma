// What Tabler publishes about a glyph beyond its name, handed in by a workbench
// at startup. The kit never ships it: see @kroma/ui/vite/icon-catalog.

/** One glyph's place in Tabler's own catalogue. */
interface IconEntry {
  category: string;
  tags: readonly string[];
}

/** Tabler's entries, keyed by Tabler's own glyph name. */
type IconCatalog = Readonly<Record<string, IconEntry>>;

const FILLED = 'filled';

// The kit's slug and Tabler's own name place their separators differently
// (`IconAB` slugs to `ab`, the catalogue calls it `a-b`), so the index drops
// them on both sides. No two catalogue names collide once flattened.
function flatten(name: string): string {
  return name.replaceAll('-', '');
}

let index = new Map<string, IconEntry>();
let categories: string[] = [];

/** Loads the catalogue the icon browser reads. A workbench calls this once at
 * startup; everywhere else it is never called and every lookup answers `null`. */
function setIconCatalog(catalog: IconCatalog): void {
  index = new Map(Object.entries(catalog).map(([name, entry]) => [flatten(name), entry]));
  categories = [...new Set(Object.values(catalog).map((entry) => entry.category))].sort((a, b) =>
    a.localeCompare(b),
  );
}

/** Tabler's entry for a glyph. A `-filled` variant inherits its base glyph's
 * entry, since the catalogue lists only the outline. `null` when the catalogue
 * is not loaded, or for the few names Tabler has since renamed. */
function iconEntry(name: string): IconEntry | null {
  const flat = flatten(name);
  const hit = index.get(flat);
  if (hit) return hit;
  if (!flat.endsWith(FILLED)) return null;
  return index.get(flat.slice(0, -FILLED.length)) ?? null;
}

/** Every category in the catalogue, sorted. Empty when it is not loaded, which
 * is what a caller checks to know whether to offer the filter at all. */
function iconCategories(): readonly string[] {
  return categories;
}

export type { IconCatalog, IconEntry };
export { iconCategories, iconEntry, setIconCatalog };
