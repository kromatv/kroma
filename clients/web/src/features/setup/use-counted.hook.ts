import type { SettingsView } from '@kromatv/client/admin';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useWebRuntime } from '#web/shared/lib/web-runtime';

const STORED = ['setup', 'counted'] as const;

function isCounted(view: SettingsView): boolean {
  const rows = view.groups.flatMap((group) => group.rows);
  return rows.find((row) => row.key === 'anonStats')?.value !== false;
}

/** The being-counted switch of the setup, in the state the server holds, and
 * the press that writes it. `counted` is null until the server has answered. */
export function useCounted(onAnswered: () => void) {
  const { client } = useWebRuntime();
  const stored = useQuery({ queryKey: STORED, queryFn: () => client.admin.settings('general') });
  const [chosen, setChosen] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const counted = chosen ?? (stored.data ? isCounted(stored.data) : null);
  const confirm = async () => {
    setBusy(true);
    try {
      if (counted !== null) {
        await client.admin.updateSettings({ anonStats: counted });
      }
    } finally {
      setBusy(false);
      onAnswered();
    }
  };
  return { counted, setCounted: setChosen, busy, confirm, failed: stored.isError };
}
