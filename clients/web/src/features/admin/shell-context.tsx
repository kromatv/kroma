import type { ServerInfo } from '@kroma/core';
import { createContext, useContext } from 'react';

export interface AdminCtx {
  serverInfo: ServerInfo | null;
}

export const AdminContext = createContext<AdminCtx | null>(null);

/** The console's shared data surface: the server every page reports on. */
export function useAdmin(): AdminCtx {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used within <AdminProvider>');
  return ctx;
}
