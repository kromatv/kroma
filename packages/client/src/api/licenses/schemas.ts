import { z } from 'zod';

/** One shipped package: where it comes from (a Rust crate, an npm package,
 * or a file the repository vendors, like a font), the license it declares,
 * where its source lives, and the indexes of its notice texts in
 * `Licenses.texts`. */
export const LicenseEntry = z.object({
  kind: z.enum(['crate', 'npm', 'asset']),
  name: z.string(),
  version: z.string().nullable(),
  license: z.string().nullable(),
  source: z.string().nullable(),
  texts: z.array(z.number().int().nonnegative()),
});
export type LicenseEntry = z.infer<typeof LicenseEntry>;

/** The third-party notices of one program, each distinct text once:
 * `GET /api/licenses` for the server, and the `third-party-licenses.json` a
 * client's build writes beside its bundle. */
export const Licenses = z.object({
  texts: z.array(z.string()),
  entries: z.array(LicenseEntry),
});
export type Licenses = z.infer<typeof Licenses>;
