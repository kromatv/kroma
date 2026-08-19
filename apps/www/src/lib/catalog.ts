// The published catalog as this site reads it: `@kroma/registry`'s model, with
// the one narrowing the site needs. Kept out of `modules.ts` so the schema stays
// build-time only - that module is bundled for the browser, and the pages read
// the reduced `SiteCatalog`, never this.

import { Manifest } from '@kroma/registry';
import { z } from 'zod';

// Only a data URI survives: the site is self-contained, so an icon that would
// reach a third-party host at render time is dropped rather than embedded.
const Icon = z
  .string()
  .nullish()
  .transform((v) => (v?.startsWith('data:image/') ? v : null));

const Entry = Manifest.extend({
  id: z.string().min(1),
  // A catalog missing these still lists; the card falls back to the id.
  name: z.string().default(''),
  version: z.string().default(''),
  icon: Icon,
});
export const Catalog = z.object({
  generatedAt: z.string().nullish(),
  modules: z.array(Entry).default([]),
});
export type Catalog = z.infer<typeof Catalog>;
