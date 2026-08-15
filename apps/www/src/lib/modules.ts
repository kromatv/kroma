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
  provides: string[];
  requires: string[];
  dependsOn: string[];
}

export interface SiteCatalog {
  generatedAt: string | null;
  modules: SiteModule[];
}

export interface RawEntry {
  id: string;
  name?: string;
  version?: string;
  description?: string | null;
  icon?: string | null;
  library?: boolean | null;
  provides?: { kind: string }[] | null;
  requires?: { kind: string }[] | null;
  dependsOn?: Record<string, string> | string[] | null;
}

export interface RawCatalog {
  generatedAt?: string | null;
  modules: RawEntry[];
}

const kinds = (xs: { kind: string }[] | null | undefined) => [
  ...new Set((xs ?? []).map((x) => x.kind).filter(Boolean)),
];

const depIds = (d: Record<string, string> | string[] | null | undefined) =>
  Array.isArray(d) ? d : Object.keys(d ?? {});

/** The catalog as fetched, reduced to what the site renders and ordered by id. */
export function toSiteCatalog(raw: RawCatalog): SiteCatalog {
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
        provides: kinds(e.provides),
        requires: kinds(e.requires),
        dependsOn: depIds(e.dependsOn),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}

/** How much has to be installed before a module is useful: its own prerequisites. */
const depth = (mod: SiteModule): number => mod.requires.length + mod.dependsOn.length;

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
