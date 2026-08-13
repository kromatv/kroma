// The bridge between the host app and an admin page. The web app mounts
// `AdminHostProvider` (inside the admin shell) with the live authed client,
// the current user, and the resolved API origin; the SDK's hooks (`useCap`,
// `usePoll`) and any admin page - built-in AND module-contributed - read them
// through `useAdminHost()`. This is what lets a module page use the same data
// access as a built-in page without importing app internals.

import type { KromaClient, User } from '@kroma/core';
import { createContext, type ReactNode, useContext } from 'react';

export interface AdminHostValue {
  client: KromaClient;
  user: User | null;
  apiBase: string;
  /** Open the host's "media details" dialog for a catalog item. A service the
   *  shell owns and a module borrows: the dialog reads the core catalog, which
   *  is not a module's to know, but a module page listing files has every
   *  reason to offer it. Absent on a shell that has no such dialog. */
  openMediaInfo?: (itemId: string, title: string) => void;
}

const AdminHostContext = createContext<AdminHostValue | null>(null);

export function AdminHostProvider({
  value,
  children,
}: Readonly<{ value: AdminHostValue; children: ReactNode }>) {
  return <AdminHostContext.Provider value={value}>{children}</AdminHostContext.Provider>;
}

/** The host-provided client / user / apiBase. Throws if used outside the
 *  provider (which the admin shell always mounts). */
export function useAdminHost(): AdminHostValue {
  const ctx = useContext(AdminHostContext);
  if (!ctx) {
    throw new Error(
      'useAdminHost must be used within <AdminHostProvider> (the admin shell mounts it)',
    );
  }
  return ctx;
}
