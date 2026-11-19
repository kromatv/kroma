import { useT } from '@kromatv/ui';
import { Button, ListRow, Switch } from '@kromatv/ui/kit';
import { useState } from 'react';
import { StepActions, StepBody, StepHeading } from '#web/features/setup/setup-shell.component';
import { useWebRuntime } from '#web/shared/lib/web-runtime';

interface CountedProps {
  counted: boolean;
  onCounted: (counted: boolean) => void;
}

function useCounted(onAnswered: () => void) {
  const { client } = useWebRuntime();
  const [counted, setCounted] = useState(true);
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    try {
      await client.admin.updateSettings({ anonStats: counted });
    } finally {
      setBusy(false);
      onAnswered();
    }
  };
  return { counted, setCounted, busy, confirm };
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
 * world. One sentence and one switch, on as it is on any new server. */
export function PrivacyStep({
  onBack,
  onContinue,
}: Readonly<{ onBack: () => void; onContinue: () => void }>) {
  const t = useT();
  const { counted, setCounted, busy, confirm } = useCounted(onContinue);
  return (
    <>
      <StepHeading title={t('setup.privacyTitle')} sub={t('setup.privacySub')} />
      <StepBody>
        <CountedSwitch counted={counted} onCounted={setCounted} />
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
