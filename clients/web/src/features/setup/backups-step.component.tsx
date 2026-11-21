import { apiErrorText } from '@kromatv/client';
import { useT } from '@kromatv/ui';
import { Button, ListRow, Switch } from '@kromatv/ui/kit';
import { StepActions, StepBody, StepHeading } from '#web/features/setup/setup-shell.component';
import { StepFailure } from '#web/features/setup/step-failure.component';
import { useBackupsAnswer } from '#web/features/setup/use-backups-answer.hook';
import type { Refusal } from '#web/shared/lib/use-backup-schedule.hook';

function BackupsSwitch({
  enabled,
  onEnabled,
}: Readonly<{ enabled: boolean; onEnabled: (enabled: boolean) => void }>) {
  const t = useT();
  return (
    <ListRow.Group>
      <ListRow.Root icon="archive" label={t('setup.backupsSwitch')} chevron={false}>
        <ListRow.Label>{t('setup.backupsSwitch')}</ListRow.Label>
        <ListRow.Trailing>
          <Switch checked={enabled} onCheckedChange={onEnabled} label={t('setup.backupsSwitch')} />
        </ListRow.Trailing>
      </ListRow.Root>
    </ListRow.Group>
  );
}

function useFailure({
  failed,
  refusal,
}: Readonly<{ failed: boolean; refusal: Refusal | null }>): string | null {
  const t = useT();
  if (refusal) {
    return apiErrorText(refusal.cause, t('setup.backupsFailed'));
  }
  return failed ? t('setup.backupsReadFailed') : null;
}

/** Whether the server backs itself up each night. One sentence and one
 * switch, in the state the server holds: off on a new server. */
export function BackupsStep({
  onBack,
  onContinue,
}: Readonly<{ onBack: () => void; onContinue: () => void }>) {
  const t = useT();
  const { enabled, setEnabled, busy, confirm, failed, refusal } = useBackupsAnswer(onContinue);
  const error = useFailure({ failed, refusal });
  return (
    <>
      <StepHeading title={t('setup.backupsTitle')} sub={t('setup.backupsSub')} />
      <StepBody>
        <StepFailure error={error} />
        {enabled === null ? null : <BackupsSwitch enabled={enabled} onEnabled={setEnabled} />}
      </StepBody>
      <StepActions onBack={onBack}>
        <Button
          size="md"
          label={t('setup.continue')}
          iconRight="arrow-right"
          loading={busy}
          onPress={() => void confirm()}
        />
      </StepActions>
    </>
  );
}
