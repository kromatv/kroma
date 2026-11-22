import type { BackupScheduleChange } from '@kromatv/client/admin';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useWebRuntime } from '#web/shared/lib/web-runtime';

const BACKUP_SCHEDULE_QUERY = ['admin', 'backup', 'schedule'] as const;

/** Why the server refused the last change, as it answered. */
export interface Refusal {
  cause: unknown;
}

/** The scheduled backups as the server holds them, and the change the owner
 * makes to them. `change` resolves false when the server refused it, and
 * `refusal` then holds its answer. */
export function useBackupSchedule() {
  const { client } = useWebRuntime();
  const queries = useQueryClient();
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const read = useQuery({
    queryKey: BACKUP_SCHEDULE_QUERY,
    queryFn: () => client.admin.backup.schedule(),
  });
  const change = async (patch: BackupScheduleChange): Promise<boolean> => {
    setRefusal(null);
    try {
      queries.setQueryData(BACKUP_SCHEDULE_QUERY, await client.admin.backup.changeSchedule(patch));
      return true;
    } catch (cause) {
      setRefusal({ cause });
      return false;
    }
  };
  return { schedule: read.data ?? null, failed: read.isError, refusal, change };
}
