// The packed-catalog shapes: what `readBundles` recovers from a `.kmod` and what
// the schema-2 `catalog.json` carries. Both are read back from somewhere else -
// a downloaded bundle, a published catalog - so both are schemas, extending the
// contract-level model in `@kroma/registry`.

import { ArtifactRef, DescribedModule } from '@kroma/registry';
import { z } from 'zod';

/** One downloadable `.kmod` build, as the packer records it. */
export const Artifact = ArtifactRef.extend({
  target: z.string().nullable(),
  file: z.string(),
  size: z.number().int().nonnegative(),
  sha256: z.string(),
  // sha256 of the UNCOMPRESSED tar. The pipeline's "did this module actually
  // change?" test, and the reason it is not `sha256`: that one covers the zstd
  // stream, so a compressor upgrade would move it while the bundle's contents
  // stood still, and every module would look like it needed a version bump.
  contentHash: z.string(),
});
export type Artifact = z.infer<typeof Artifact>;

/** One module in the catalog: its manifest, its icon and every build of it. */
export const Entry = DescribedModule.extend({
  icon: z.string().optional(),
  artifacts: z.array(Artifact),
  // Schema-1 compatibility mirror of artifacts[0].
  file: z.string(),
  url: z.string(),
  size: z.number().int().nonnegative(),
  sha256: z.string(),
});
export type Entry = z.infer<typeof Entry>;

export const Catalog = z.object({
  schema: z.number(),
  generatedAt: z.string().nullish(),
  modules: z.array(Entry).default([]),
});
export type Catalog = z.infer<typeof Catalog>;
