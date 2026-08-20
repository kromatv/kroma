// Shared fetch layer for the admin module endpoints (/api/admin/modules* and
// /api/admin/store/*), so the bearer + base-URL plumbing lives in one place.
// Store responses cross a trust boundary and are parsed with the zod wire
// schemas from @kroma/core.

import {
  ModuleEnabledResult,
  ModuleRestartResult,
  StoreCatalog,
  StoreInstallReport,
  StorePlan,
  StoreRegistryPreview,
  StoreUninstallConflict,
  StoreUpdateResult,
  sessionToken,
} from '@kroma/core';
import type { ModuleManifest } from '@kroma/module-sdk';
import { apiBase } from '#web/shared/lib/api';

/** A module as `GET /api/admin/modules` returns it: the manifest plus its
 *  runtime admin state. */
export interface AdminModule extends ModuleManifest {
  enabled: boolean;
  configValues: Record<string, unknown>;
  removable: boolean;
  /** Where the module came from. Absent for a compile-time module. */
  origin?: ModuleOrigin;
  /** The supervisor is running this sidecar right now. */
  running: boolean;
  /** This module ships a process at all. `false` for a library module, whose
   *  code is co-linked into another sidecar: it is never running, and showing
   *  it as stopped would be a false alarm. */
  hasSidecar: boolean;
  /** Points this module needs that no enabled module answers, as
   *  `point` or `point#id`. Absent when there are none. Entries mean the module is
   *  installed and running and INERT, which is otherwise invisible. */
  unmet?: string[];
}

/** Where an installed module came from, as the server recorded it at install. */
export interface ModuleOrigin {
  kind: 'registry' | 'upload' | 'url' | 'unknown';
  url?: string;
  /** Unix seconds; 0 when the install predates origin tracking. */
  installedAt: number;
  /** The binary on disk is newer than the installed artifact, i.e. a local
   *  build replaced it. */
  localBuild: boolean;
}

export const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The one search rule for module lists: id, name and description. */
export function matchesQuery(
  m: { id: string; name: string; description?: string | null },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [m.id, m.name, m.description ?? ''].some((s) => s.toLowerCase().includes(q));
}

// The bearer + base-URL core every admin request shares, JSON or not.
function adminFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = sessionToken();
  return fetch(`${apiBase()}/api/admin${path}`, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
}

export async function adminApi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await adminFetch(path, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  if (!res.ok) {
    // Surface the server's message (compat verdicts, dependency conflicts,
    // checksum mismatches) instead of a bare status code.
    const text = await res.text().catch(() => '');
    throw new Error(text || `${init?.method ?? 'GET'} ${path} -> ${res.status}`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const fetchAdminModules = () => adminApi<AdminModule[]>('/modules');

export async function setModuleEnabled(id: string, enabled: boolean): Promise<ModuleEnabledResult> {
  return ModuleEnabledResult.parse(
    await adminApi<unknown>(`/modules/${encodeURIComponent(id)}/enabled`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    }),
  );
}

export async function fetchStoreCatalog(): Promise<StoreCatalog> {
  return StoreCatalog.parse(await adminApi<unknown>('/store/catalog'));
}

/** Dry-run of an install: what it would pull, and the optional deps on offer. */
export async function fetchInstallPlan(id: string, include: string[] = []): Promise<StorePlan> {
  return StorePlan.parse(
    await adminApi<unknown>('/store/plan', {
      method: 'POST',
      body: JSON.stringify({ id, include }),
    }),
  );
}

/** Install/update a module (+ opted-in optional deps) from the registry.
 *  Progress streams as `module.op.*` events while this call is in flight. */
export async function installById(id: string, include: string[] = []): Promise<StoreInstallReport> {
  return StoreInstallReport.parse(
    await adminApi<unknown>('/store/install-id', {
      method: 'POST',
      body: JSON.stringify({ id, include }),
    }),
  );
}

/** Batch-update outdated modules off one catalog fetch; absent `ids` means
 *  every outdated one. */
export async function updateModules(ids?: string[]): Promise<StoreUpdateResult> {
  return StoreUpdateResult.parse(
    await adminApi<unknown>('/store/update', {
      method: 'POST',
      body: JSON.stringify(ids ? { ids } : {}),
    }),
  );
}

/** Fetch + parse a candidate registry URL before saving it. */
export async function previewRegistry(url: string): Promise<StoreRegistryPreview> {
  return StoreRegistryPreview.parse(
    await adminApi<unknown>('/store/registry-preview', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),
  );
}

/** Thrown by [`uninstallModule`] when other enabled modules still depend on
 *  the target; retrying with `force` skips the guard. */
export class UninstallConflictError extends Error {
  readonly dependents: string[];

  constructor(msg: string, dependents: string[]) {
    super(msg);
    this.name = 'UninstallConflictError';
    this.dependents = dependents;
  }
}

export async function uninstallModule(id: string, force = false): Promise<void> {
  const suffix = force ? '?force=true' : '';
  const res = await adminFetch(`/store/${encodeURIComponent(id)}${suffix}`, { method: 'DELETE' });
  if (res.status === 409) {
    const conflict = StoreUninstallConflict.parse(await res.json());
    throw new UninstallConflictError(conflict.error, conflict.dependents);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `uninstall failed (${res.status})`);
  }
}

/** The manual escape hatch: upload a `.kmod` directly, no registry involved.
 *  The body is the raw file, so this skips `adminApi`'s JSON content type. */
export async function installBundle(file: File): Promise<void> {
  const res = await adminFetch('/store/install', { method: 'POST', body: file });
  if (!res.ok) {
    throw new Error((await res.text().catch(() => '')) || `install failed (${res.status})`);
  }
}

/** Stop a module's sidecar and start it again from the binary on disk. */
export async function restartModule(id: string): Promise<ModuleRestartResult> {
  const res = await adminFetch(`/modules/${encodeURIComponent(id)}/restart`, { method: 'POST' });
  if (!res.ok) {
    throw new Error((await res.text()) || `restart failed (${res.status})`);
  }
  return ModuleRestartResult.parse(await res.json());
}
