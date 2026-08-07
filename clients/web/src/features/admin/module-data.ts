// The module admin surface's shared data hooks: the two polls every module
// view reads (installed modules + store catalog) with the one refresh that
// covers them, and the enable-toggle flow the list row and the detail drawer
// both drive.

import { usePoll } from '@kroma/admin-kit';
import { useState } from 'react';
import {
  fetchAdminModules,
  fetchStoreCatalog,
  message,
  setModuleEnabled,
} from '#web/features/admin/module-api';
import { useRefreshModules } from '#web/modules/ModuleHostProvider';

export function useModuleData() {
  const refreshModules = useRefreshModules();
  const { data: modules, reload } = usePoll(['admin', 'modules'], fetchAdminModules, 30000);
  const { data: catalog, reload: reloadCatalog } = usePoll(
    ['admin', 'store', 'catalog'],
    fetchStoreCatalog,
    300000,
  );
  // Re-snapshots the module host too, so the sidebar nav and module routes
  // follow installs/toggles without a page reload.
  const refreshAll = async () => {
    await refreshModules();
    reload();
    reloadCatalog();
  };
  return { modules, catalog, reload, reloadCatalog, refreshAll };
}

/** Toggle a module and surface the server's start warning (or the request
 * error) as `error`; `onDone` fires after every attempt. */
export function useModuleToggle(id: string, onDone?: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggle = async (enabled: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await setModuleEnabled(id, enabled);
      setError(res.warning ?? null);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
      onDone?.();
    }
  };
  return { busy, error, toggle };
}
