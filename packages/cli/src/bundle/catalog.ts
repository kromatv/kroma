import { ArtifactRef, DescribedModule } from '@kroma/registry';
import { z } from 'zod';

/** One downloadable `.kmod` build, as the packer records it. `contentHash` is
 *  the sha256 of the UNCOMPRESSED tar: the "did this module change?" key, kept
 *  apart from `sha256` so a compressor upgrade cannot move it. */
export const Artifact = ArtifactRef.extend({
  target: z.string().nullable(),
  file: z.string(),
  size: z.number().int().nonnegative(),
  sha256: z.string(),
  contentHash: z.string(),
});
export type Artifact = z.infer<typeof Artifact>;

/** One module in the catalog: its manifest, its icon and every build of it,
 *  with `file`/`url`/`size`/`sha256` mirroring `artifacts[0]` for schema-1 readers. */
export const Entry = DescribedModule.extend({
  icon: z.string().optional(),
  artifacts: z.array(Artifact),
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
