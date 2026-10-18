// What Tabler publishes about a glyph beyond its name, handed in by a workbench
// at startup. The kit never ships it: see @kromatv/ui/vite/icon-catalog.

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

/** Immutable metadata lookup owned by the library that loaded it. */
function createIconCatalog(catalog: IconCatalog) {
  const index = new Map(Object.entries(catalog).map(([name, entry]) => [flatten(name), entry]));
  const categories = Object.freeze(
    [...new Set(Object.values(catalog).map((entry) => entry.category))].sort((a, b) =>
      a.localeCompare(b),
    ),
  );
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

  return Object.freeze({ iconEntry, iconCategories });
}
const EMPTY_ICON_CATALOG = createIconCatalog({});
type IconCatalogIndex = ReturnType<typeof createIconCatalog>;

export type { IconCatalog, IconCatalogIndex, IconEntry };
export { createIconCatalog, EMPTY_ICON_CATALOG };
