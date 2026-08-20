// What a registry document is built FROM: a module's own `module.json`, the
// icon beside it, and the builds it ships. Schemas rather than interfaces
// because every one of these arrives as JSON from somewhere else - out of a
// downloaded `.kmod`'s tar, or off a published catalog - so the shape is
// checked, not asserted.

import { z } from 'zod';
import { Contribution, PointDef, PointReq } from '../documents/v1.ts';

// Any optional field may arrive as an explicit null.
const DependencyMap = z.record(z.string(), z.string()).nullish();

/** One admin-configurable setting a module exposes. */
export const ConfigField = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(['string', 'bool', 'number', 'select']),
  default: z.string().nullish(),
  options: z.array(z.string()).nullish(),
  placeholder: z.string().nullish(),
  // Rendered as a password input, and the value is treated write-only.
  secret: z.boolean().nullish(),
  required: z.boolean().nullish(),
});
export type ConfigField = z.infer<typeof ConfigField>;

/** The version this file defines. */
const SCHEMA_VERSION = 2;

/** A module id: reverse-DNS, lowercase. */
export const REVERSE_DNS_ID = /^[a-z0-9]+(?:\.[a-z0-9-]+)+$/;

// A table (`downloads`) or one of its columns (`users.username`). Anything not
// listed is denied, so the spelling has to be exact.
const TableOrColumn = z.string().regex(/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?$/);

/** The slice of the SHARED core database a module may reach. */
export const CoreScope = z.object({
  read: z
    .array(TableOrColumn)
    .nullish()
    .describe(
      'Tables and columns this module may SELECT, as "table" or "table.column". A column named in a WHERE is reached as much as one that is projected.',
    ),
  write: z
    .array(TableOrColumn)
    .nullish()
    .describe(
      'Tables this module may INSERT / UPDATE / DELETE. A write grant is not a read grant, and a foreign key drags its other table in: writing a child reads the parent, and a cascading delete writes the child.',
    ),
});
export type CoreScope = z.infer<typeof CoreScope>;

/** A module's databases, and the capability itself. */
export const Storage = z.object({
  core: CoreScope.nullish().describe(
    "The slice of the shared core database this module may reach. Enforced per connection by SQLite's authorizer at prepare time, so it cannot be worked around by building the SQL as a string. Absent means none of it.",
  ),
  adopt: z
    .array(z.string().regex(/^[A-Za-z_]\w*$/))
    .nullish()
    .describe(
      "Tables this module used to keep in the core database and now owns. The core moves each one - schema, indexes and rows - into the module's own file before the module is spawned, then drops the core copy, so it happens exactly once.",
    ),
});
export type Storage = z.infer<typeof Storage>;

/** A module's `module.json`, as authored. */
export const Manifest = z.object({
  /** Editor-only: lets a manifest point an editor at its own contract. Declared
   *  so a strict authoring check allows it, and stripped on the way to the wire,
   *  because a registry document is not where a `$schema` belongs. */
  $schema: z
    .string()
    .optional()
    .describe(
      'The schema this manifest is written against, so an editor can offer completion and inline docs. Ignored everywhere else.',
    ),
  // Optional in the SHAPE, required by the contract. A catalog row is derived
  // from a bundle that may predate the field, and a registry that still lists
  // one should render rather than fail to parse - the refusal belongs where the
  // bundle is actually opened, which is `speaksCurrentSchema` at install.
  schemaVersion: z
    .number()
    .int()
    .nullish()
    .describe(
      'The manifest schema this module is built against. A server that speaks a different one refuses the bundle rather than reading it on a best-effort basis, because the fields that moved between versions parse as absent, not as errors.',
    ),
  id: z.string().describe('Reverse-DNS identifier, e.g. tv.kroma.torrents. The runtime join key.'),
  name: z.string().describe('Display name, shown in the Store and the admin.'),
  version: z
    .string()
    .describe(
      "The module's own semver version. Bump it whenever the bundle changes: CI content-hashes each bundle and refuses a run whose bytes moved while this stood still.",
    ),
  description: z.string().nullish().describe('One line, shown on the Store card.'),
  /** What this module needs from its host, by engine name and semver range
   *  (`{ server: ">=0.1.4" }`). A bare version means "at least that". An engine
   *  the host cannot check is refused, not ignored. */
  engines: z
    .record(z.string(), z.string())
    .nullish()
    .describe(
      'What this module needs from its host, by engine name and semver range, e.g. { "server": ">=0.1.4" }. A bare version means "at least that". An engine the host cannot check is refused, not ignored.',
    ),
  library: z
    .boolean()
    .nullish()
    .describe(
      'A library module: its .kmod ships no native binary (its code is co-linked into the processes that need it), so the supervisor registers it but spawns no process.',
    ),
  dependencies: DependencyMap.describe(
    'Hard dependencies as a map of module id to semver range; a bare "*" means any version. Enforced on the backend.',
  ),
  optionalDependencies: DependencyMap.describe(
    'Soft dependencies, same shape: version-checked and ordered first when present, but not required.',
  ),
  definesPoints: z
    .array(PointDef)
    .nullish()
    .describe(
      "Points this module INVENTS, for other modules to plug into. `name` is local; the full name is `<this module's id>/<name>`, so ownership reads off the name and two authors cannot collide.",
    ),
  contributes: z
    .array(Contribution)
    .nullish()
    .describe(
      'Points this module answers, its own included. One declaration where there used to be three: `provides` described a capability for the admin picker and `ports` described the RPC name resolution matched on, and an engine advertised the same fact under both.',
    ),
  consumes: z
    .array(PointReq)
    .nullish()
    .describe(
      'Points this module CALLS. Unlike a module id in `dependencies`, this says "something has to answer this", which is what a store can resolve without naming a peer.',
    ),
  config: z
    .array(ConfigField)
    .nullish()
    .describe('Admin-configurable settings this module exposes, rendered as a form.'),
  storage: Storage.nullish().describe(
    "This module's databases, and the capability itself: without a storage object the module gets no database and its binary does not link SQLite. Its presence alone grants it its own file at <data>/modules/<id>/module.sqlite, where its migrations run and which it owns outright.",
  ),
  feRemote: z
    .object({ module: z.string() })
    .nullish()
    .describe(
      'Frontend Module Federation remote (runtime-loaded modules). The entry URL is derived by the server as /modules/<id>/remoteEntry.js.',
    ),
  // Store metadata, all optional.
  author: z.string().nullish().describe('Who published it, shown on the Store page.'),
  homepage: z.string().nullish().describe('Where to read more about it.'),
  license: z.string().nullish().describe('SPDX identifier, e.g. GPL-2.0-or-later.'),
  keywords: z
    .array(z.string())
    .nullish()
    .describe("Free-form search terms, matched by the Store's search."),
  tags: z
    .array(z.string())
    .nullish()
    .describe(
      'Words a store filters by. Defaults to the local half of each point this module answers, so it rarely needs writing by hand.',
    ),
});
export type Manifest = z.infer<typeof Manifest>;

/** Whether a module was built against the manifest contract this build speaks.
 *  A bundle that was not is refused rather than read on a best-effort basis: the
 *  fields that moved between versions parse as ABSENT, not as errors, so a stale
 *  one would install with its dependencies silently dropped. */
export function speaksCurrentSchema(manifest: Pick<Manifest, 'schemaVersion'>): boolean {
  return manifest.schemaVersion === SCHEMA_VERSION;
}

const mapOf = (raw: Manifest['dependencies']): Record<string, string> => raw ?? {};

/** The versions a module requires, by id. */
export function dependenciesOf(manifest: Manifest): Record<string, string> {
  return mapOf(manifest.dependencies);
}

/** The versions a module suggests but does not require, by id. */
export function optionalDependenciesOf(manifest: Manifest): Record<string, string> {
  return mapOf(manifest.optionalDependencies);
}

/** What a registry document says about one downloadable build. */
export const ArtifactRef = z.object({
  target: z.string().nullish(),
  url: z.string(),
  size: z.number().int().nonnegative(),
  sha256: z.string().nullish(),
  contentHash: z.string().nullish(),
});
export type ArtifactRef = z.infer<typeof ArtifactRef>;

/** The least a registry document can be built from: a manifest, an icon, and
 *  the builds it ships. */
export const DescribedModule = Manifest.extend({
  icon: z.string().nullish(),
  artifacts: z.array(ArtifactRef),
});
export type DescribedModule = z.infer<typeof DescribedModule>;
