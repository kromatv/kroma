import { useState } from 'react';
import { useBackupSchedule } from '#web/shared/lib/use-backup-schedule.hook';

/** The backups switch of the setup, in the state the server holds, and the
 * press that writes it. `enabled` is null until the server has answered, and
 * the press writes only a state the owner changed. A refused change keeps the
 * owner on the step. */
export function useBackupsAnswer(onAnswered: () => void) {
  const { schedule, failed, refusal, change } = useBackupSchedule();
  const [chosen, setChosen] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const enabled = chosen ?? schedule?.enabled ?? null;
  const confirm = async () => {
    setBusy(true);
    const kept = enabled === null || enabled === schedule?.enabled || (await change({ enabled }));
    setBusy(false);
    if (kept) {
      onAnswered();
    }
  };
  return { enabled, setEnabled: setChosen, busy, confirm, failed, refusal };
}
