// The bridge between the host app and the admin UI kit. The web app mounts
// `AdminKitProvider` (inside the admin shell) with the live authed client, the
// current user, and the resolved API origin; the kit's hooks (`useCap`,
// `useAsyncAction`) and any admin page read them through `useAdminKit()`.
// This lets a MODULE page use the same primitives and data access as a
// built-in admin page while the kit stays a leaf package with no dependency
// on the web app.

import type { KromaClient, User } from '@kroma/core';
import { createContext, type ReactNode, useContext } from 'react';

export interface AdminKitValue {
  client: KromaClient;
  user: User | null;
  apiBase: string;
}

const AdminKitContext = createContext<AdminKitValue | null>(null);

export function AdminKitProvider({
  value,
  children,
}: Readonly<{ value: AdminKitValue; children: ReactNode }>) {
  return <AdminKitContext.Provider value={value}>{children}</AdminKitContext.Provider>;
}

/** The host-provided client / user / apiBase. Throws if used outside the
 *  provider (which the admin shell always mounts). */
export function useAdminKit(): AdminKitValue {
  const ctx = useContext(AdminKitContext);
  if (!ctx) {
    throw new Error(
      'useAdminKit must be used within <AdminKitProvider> (the admin shell mounts it)',
    );
  }
  return ctx;
}

/** Resolve a metadata image path (relative `/api/...` cached art, or an absolute
 *  URL) against a KROMA origin. The kit's own copy of the app helper so it needs
 *  no app import. */
export function resolveImageUrl(apiBase: string, url: string | null | undefined): string | null {
  if (!url) return null;
  return /^https?:\/\//.test(url) ? url : `${apiBase}${url}`;
}
