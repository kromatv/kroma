import { useT } from '@kromatv/ui';
import { GuidedFlow, ListRow, Switch } from '@kromatv/ui/kit';
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
      <GuidedFlow.Header>
        <GuidedFlow.Title>{t('setup.privacyTitle')}</GuidedFlow.Title>
        <GuidedFlow.Subtitle>{t('setup.privacySub')}</GuidedFlow.Subtitle>
      </GuidedFlow.Header>
      <GuidedFlow.Panel>
        <StepFailure error={failed ? t('setup.privacyReadFailed') : null} />
        {counted === null ? null : <CountedSwitch counted={counted} onCounted={setCounted} />}
      </GuidedFlow.Panel>
      <GuidedFlow.Footer>
        <GuidedFlow.Previous onPress={onBack} />
        <GuidedFlow.Actions>
          <GuidedFlow.Next
            label={t('setup.privacyConfirm')}
            loading={busy}
            onPress={() => void confirm()}
          />
        </GuidedFlow.Actions>
      </GuidedFlow.Footer>
    </>
  );
}
