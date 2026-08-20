import type { Catalog } from '#site/lib/catalog';

/** One catalog entry, reduced to the language-invariant facts the site renders. */
export interface SiteModule {
  id: string;
  name: string;
  version: string;
  /** English, from the catalog. Site copy is preferred; this is the fallback. */
  description: string | null;
  icon: string | null;
  /** A library module is linked by the sidecars that use it; it runs no process of its own. */
  library: boolean;
  answers: string[];
  needs: string[];
  dependencies: string[];
}

export interface SiteCatalog {
  generatedAt: string | null;
  modules: SiteModule[];
}

// The local half of each point, deduped: `tv.kroma.torrents/client` reads as
// `client` on a marketing page, where the defining module's id is noise.
const points = (xs: { point: string }[] | null | undefined) => [
  ...new Set((xs ?? []).map((x) => x.point?.split('/').pop()).filter(Boolean) as string[]),
];

const depIds = (d: Catalog['modules'][number]['dependencies']) => Object.keys(d ?? {});

/** The catalog as fetched, reduced to what the site renders and ordered by id. */
export function toSiteCatalog(raw: Catalog): SiteCatalog {
  return {
    generatedAt: raw.generatedAt ?? null,
    modules: raw.modules
      .map((e) => ({
        id: e.id,
        name: e.name || e.id,
        version: e.version ?? '',
        description: e.description ?? null,
        icon: e.icon ?? null,
        library: e.library === true,
        answers: points(e.contributes),
        needs: points(e.consumes),
        dependencies: depIds(e.dependencies),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}

/** How much has to be installed before a module is useful: its own prerequisites. */
const depth = (mod: SiteModule): number => mod.needs.length + mod.dependencies.length;

/**
 * The catalog in the order the page reads: what stands on its own first, then
 * what builds on it, alphabetically within each tier.
 *
 * Derived from the catalog rather than from a list of ids, so a module added to
 * or dropped from the registry needs no change here. This site knows that
 * modules have prerequisites and names; it does not know which modules exist.
 */
export function ordered(modules: readonly SiteModule[]): SiteModule[] {
  return [...modules].sort(
    (a, b) => depth(a) - depth(b) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
}

/** `2026-08-15T13:19:46.343Z` as `2026-08-15`, or null when it is not a date. */
export function catalogDay(generatedAt: string | null): string | null {
  if (!generatedAt) return null;
  const t = Date.parse(generatedAt);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}
