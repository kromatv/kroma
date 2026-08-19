// The wire shape published by the backend at GET /api/modules. Mirrors the Rust
// `kroma_module_sdk::ModuleManifest` (serialized camelCase). The frontend reads
// this to learn which backend modules are active and to reconcile them against
// the frontend modules registered in the host.
//
// The manifest half comes from `@kroma/registry`, which is where the contract is
// defined; what is added here is the runtime state only this endpoint reports.

import type { ConfigField, Manifest } from '@kroma/registry';

export type { ConfigField } from '@kroma/registry';

/** One capability a backend module provides. `kind`+`id` are the interface and
 *  implementation; engine capabilities (download-client, indexer-engine) may also
 *  carry UI metadata so the admin's add-picker is data-driven. */
export interface Capability {
  kind: string;
  id: string;
  label?: string;
  fields?: ConfigField[];
  flow?: string;
}

/** A map of module id to semver range; a bare `"*"` means any version. Ranges
 *  are enforced on the backend, so the frontend registry reads only the id, for
 *  setup ordering. */
export type Dependencies = Record<string, string>;

/** A capability dependency: satisfied by any module whose `provides` matches. */
export interface CapabilityReq {
  kind: string;
  id?: string;
}

/** The frontend remote a runtime-loaded module ships (Module Federation). The
 *  entry URL is derived by the host as `/modules/<id>/remoteEntry.js`. */
export interface FeRemote {
  module: string;
}

/** A backend module's self-description: the manifest contract, plus whether the
 *  server currently has it enabled. */
export type ModuleManifest = Manifest & {
  feRemote?: FeRemote;
  /** Whether the server currently has it enabled; runtime state, not manifest. */
  enabled?: boolean;
};
