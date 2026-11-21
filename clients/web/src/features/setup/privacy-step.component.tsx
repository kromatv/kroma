import { useT } from '@kromatv/ui';
import { GuidedFlow, ListRow, Switch } from '@kromatv/ui/kit';
import { useState } from 'react';
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
      <GuidedFlow.Header>
        <GuidedFlow.Title>{t('setup.privacyTitle')}</GuidedFlow.Title>
        <GuidedFlow.Subtitle>{t('setup.privacySub')}</GuidedFlow.Subtitle>
      </GuidedFlow.Header>
      <GuidedFlow.Panel>
        <CountedSwitch counted={counted} onCounted={setCounted} />
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
