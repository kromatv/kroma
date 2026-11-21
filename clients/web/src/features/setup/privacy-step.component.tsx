import { useT } from '@kromatv/ui';
import { Button, ListRow, Switch } from '@kromatv/ui/kit';
import { StepActions, StepBody, StepHeading } from '#web/features/setup/setup-shell.component';
import { StepFailure } from '#web/features/setup/step-failure.component';
import { useCounted } from '#web/features/setup/use-counted.hook';

interface CountedProps {
  counted: boolean;
  onCounted: (counted: boolean) => void;
}

function CountedSwitch({ counted, onCounted }: Readonly<CountedProps>) {
  const t = useT();
  return (
    <ListRow.Group>
      <ListRow.Root icon="shield-check" label={t('setup.privacySwitch')} chevron={false}>
        <ListRow.Label>{t('setup.privacySwitch')}</ListRow.Label>
        <ListRow.Trailing>
          <Switch checked={counted} onCheckedChange={onCounted} label={t('setup.privacySwitch')} />
        </ListRow.Trailing>
      </ListRow.Root>
    </ListRow.Group>
  );
}

/** Whether this server is counted among the KROMA servers running in the
 * world. One sentence and one switch, in the state the server holds. */
export function PrivacyStep({
  onBack,
  onContinue,
}: Readonly<{ onBack: () => void; onContinue: () => void }>) {
  const t = useT();
  const { counted, setCounted, busy, confirm, failed } = useCounted(onContinue);
  return (
    <>
      <StepHeading title={t('setup.privacyTitle')} sub={t('setup.privacySub')} />
      <StepBody>
        <StepFailure error={failed ? t('setup.privacyReadFailed') : null} />
        {counted === null ? null : <CountedSwitch counted={counted} onCounted={setCounted} />}
      </StepBody>
      <StepActions onBack={onBack}>
        <Button
          size="md"
          label={t('setup.privacyConfirm')}
          iconRight="arrow-right"
          loading={busy}
          onPress={() => void confirm()}
        />
      </StepActions>
    </>
  );
}
