// Manifest schema v3: every module is a WebAssembly component. What only a native
// module needed is gone (`seam`), and what a component asks of its host is new
// (`helpers`, `component`). Everything else is v2's, imported rather than copied,
// so the two cannot drift where they agree.

import { z } from 'zod';
import { ArtifactRef, Manifest as V2 } from './v2.ts';

const SCHEMA_VERSION = 3;

/** A module's `module.json`, as authored. */
export const Manifest = V2.omit({ seam: true }).extend({
  dataDirs: z
    .array(z.string().regex(/^[A-Za-z0-9_-]+$/))
    .nullish()
    .describe(
      "Directories under the server's data directory that hold this module's own state. The server opens them only to a module the official registry shipped; any other keeps its state in its own directory.",
    ),
  helpers: z
    .record(
      z.string(),
      z.strictObject({
        assets: z.record(
          z.string().regex(/^[a-z]+-[a-z0-9_]+$/),
          z.strictObject({
            url: z.url(),
            sha256: z.string().regex(/^[0-9a-f]{64}$/),
            member: z.string().nullish(),
          }),
        ),
      }),
    )
    .nullish()
    .describe(
      'Upstream programs the host fetches, verifies and starts for this module, by the name permissions.run declares them under. Each has one pinned build per platform, keyed <os>-<arch> as Rust names them, such as linux-x86_64.',
    ),
  component: z
    .strictObject({
      instances: z.number().int().min(1).max(16).nullish(),
      memoryMib: z.number().int().min(1).nullish(),
      cpuSeconds: z.number().int().min(1).nullish(),
    })
    .nullish()
    .describe(
      'What this module needs from the host beyond the default: instances answering at once (each has its own memory, so more than one fits only a module whose state lives in its database), the memory one may grow to, and the seconds of its own time one call may spend.',
    ),
});
export type Manifest = z.infer<typeof Manifest>;

/** Whether a module was built against the manifest contract this build speaks.
 *  A bundle that was not is refused rather than read on a best-effort basis: a v2
 *  bundle carries a native binary this contract has no way to run. */
export function speaksCurrentSchema(manifest: Pick<Manifest, 'schemaVersion'>): boolean {
  return manifest.schemaVersion === SCHEMA_VERSION;
}

/** The least a registry document can be built from: a manifest, an icon, and
 *  the one build it ships. */
export const DescribedModule = Manifest.extend({
  icon: z.string().nullish(),
  artifacts: z.array(ArtifactRef),
});
export type DescribedModule = z.infer<typeof DescribedModule>;
