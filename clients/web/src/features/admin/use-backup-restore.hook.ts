import { apiErrorText, type KromaClient } from '@kromatv/client';
import type { BackupImportOptions } from '@kromatv/client/admin';
import { useT } from '@kromatv/ui';
import { useState } from 'react';
import { asksFirst, type RemovedLibraries, toShow } from '#web/features/admin/backup-restore';
import { useAuth } from '#web/shared/lib/auth';

type Restored = { users: number } | { removing: RemovedLibraries };

interface Restore {
  file: File;
  options: BackupImportOptions;
  removing: RemovedLibraries | null;
}

async function previewThenRestore(client: KromaClient, restore: Restore): Promise<Restored> {
  const { file, options, removing } = restore;
  const shown = asksFirst(options, removing)
    ? toShow((await client.admin.backup.preview(file, options)).removedLibraries)
    : null;
  if (shown) {
    return { removing: shown };
  }
  const res = await client.admin.backup.import(file, options);
  return { users: res.imported.users ?? 0 };
}

interface RestoreProps {
  file: File;
  encrypted: boolean;
  onDone: (message: string) => void;
}

/** The import dialog's state: the password and reset the owner chose, the
 * libraries a reset would remove once the server named them, and `run`, which
 * asks for that list before a reset and restores once it was shown. */
export function useBackupRestore({ file, encrypted, onDone }: RestoreProps) {
  const t = useT();
  const { client } = useAuth();
  const [password, setPassword] = useState('');
  const [reset, setReset] = useState(false);
  const [removing, setRemoving] = useState<RemovedLibraries | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = { password: encrypted ? password.trim() || undefined : undefined, reset };

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const restored = await previewThenRestore(client, { file, options, removing });
      if ('users' in restored) {
        onDone(t('admin.backupImported', { users: restored.users }));
      } else {
        setRemoving(restored.removing);
      }
    } catch (e) {
      setError(apiErrorText(e, t('admin.backupImportFailed')));
    } finally {
      setBusy(false);
    }
  }
  return { password, setPassword, reset, setReset, removing, busy, error, run };
}
