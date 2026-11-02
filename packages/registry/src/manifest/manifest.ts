// The manifest contract, by version.
//
// Each published version keeps its definition here rather than being edited in
// place, because its JSON Schema stays served at a pinned URL forever: a third
// party that validated against `/schemas/2/manifest.json` must keep getting the
// schema it pinned, not whatever the contract became. Adding v3 is a new file
// beside this one, a line in `MANIFEST_SCHEMAS`, and a bump below -- for a
// change that BREAKS a reader. A new optional field is not one: a reader that
// predates it sees the same manifest minus a capability, which is what an
// optional field is for.

import type { z } from 'zod';
import { Manifest as V2 } from './v2.ts';
import { Manifest as V3 } from './v3.ts';

/** The manifest schema this build speaks. Distinct from the documents'
 *  `apiVersion`: one versions a file a module author writes, the other versions
 *  the documents a registry serves, and they move independently. */
export const MODULE_SCHEMA_VERSION = 3;

/** Every published manifest version, so a schema URL keeps resolving after the
 *  current one moves on. */
export const MANIFEST_SCHEMAS: Record<number, z.ZodType> = { 2: V2, 3: V3 };

export { Helpers } from './helpers.ts';
export { SettingsScope } from './settings-scope.ts';
export { CoreScope, Storage } from './storage.ts';
export {
  ArtifactRef,
  ConfigField,
  dependenciesOf,
  optionalDependenciesOf,
  REVERSE_DNS_ID,
} from './v2.ts';
export { DescribedModule, Manifest, speaksCurrentSchema } from './v3.ts';
export { notificationsProblem } from './notifications.ts';
export { Permissions } from './permissions.ts';
