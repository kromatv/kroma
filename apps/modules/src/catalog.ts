import { ArtifactRef, DescribedModule } from '@kroma/registry';
import { z } from 'zod';

// The shape is `@kroma/registry`'s; what is site-specific is the hardening. This
// catalog is rendered into a page with clickable download links and checksums
// shown as fact, so a malformed upstream value becomes `null` (absent) rather
// than reaching the DOM.
const Https = z
  .string()
  .nullish()
  .transform((v) => (v?.startsWith('https://') ? v : null));

const HexSha256 = z
  .string()
  .nullish()
  .transform((v) => (v && /^[0-9a-f]{64}$/i.test(v) ? v : null));

const Artifact = ArtifactRef.extend({
  size: z.number().nullish(),
  url: Https,
  sha256: HexSha256,
  contentHash: HexSha256,
});

/** One module as the published catalog carries it: the registry's own model,
 *  plus the schema-1 mirror older catalogs put at the top level. */
export const ModuleEntry = DescribedModule.extend({
  // A catalog missing these is still listable; the card just has less to show.
  name: z.string().default(''),
  version: z.string().default(''),
  artifacts: z.array(Artifact).default([]),
  size: z.number().nullish(),
  url: Https,
  sha256: HexSha256,
});
export type ModuleEntry = z.infer<typeof ModuleEntry>;

export const Catalog = z.object({
  generatedAt: z.string().nullish(),
  modules: z.array(ModuleEntry).default([]),
  // A proxying registry that cannot reach its upstream says so here.
  error: z.string().nullish(),
});
export type Catalog = z.infer<typeof Catalog>;

/** A catalog body as fetched, or `null` when it is not one. */
export function parseCatalog(body: string): Catalog | null {
  try {
    const parsed = Catalog.safeParse(JSON.parse(body));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
