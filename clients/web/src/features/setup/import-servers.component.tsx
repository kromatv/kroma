import type { ImportServer } from '@kromatv/client/importers';
import { useT } from '@kromatv/ui';
import { Button, ChoiceList } from '@kromatv/ui/kit';
import { useState } from 'react';
import { useImportSession } from '#web/features/setup/import-session.component';
import { StepActions, StepBody, StepHeading } from '#web/features/setup/setup-shell.component';

function ServerChoice({ server }: Readonly<{ server: ImportServer }>) {
  return (
    <ChoiceList.Item value={server.id}>
      <ChoiceList.Label>{server.name}</ChoiceList.Label>
      {server.address ? <ChoiceList.Hint>{server.address}</ChoiceList.Hint> : null}
    </ChoiceList.Item>
  );
}

interface ListProps {
  servers: readonly ImportServer[];
  picked: string | null;
  onPick: (id: string) => void;
}

function ServerList({ servers, picked, onPick }: Readonly<ListProps>) {
  const t = useT();
  return (
    <ChoiceList.Root
      size="md"
      label={t('setup.importServersTitle')}
      value={picked}
      onValueChange={onPick}
    >
      {servers.map((server) => (
        <ServerChoice key={server.id} server={server} />
      ))}
    </ChoiceList.Root>
  );
}

/** Which server to bring over, for a sign-in that reaches several. */
export function ImportServers({ onBack }: Readonly<{ onBack: () => void }>) {
  const t = useT();
  const { session, update } = useImportSession();
  const [picked, setPicked] = useState<string | null>(null);
  const chosen = session.servers.find((server) => server.id === picked);
  return (
    <>
      <StepHeading title={t('setup.importServersTitle')} sub={t('setup.importServersSub')} />
      <StepBody>
        <ServerList servers={session.servers} picked={picked} onPick={setPicked} />
      </StepBody>
      <StepActions onBack={onBack}>
        <Button
          size="md"
          label={t('setup.continue')}
          iconRight="arrow-right"
          disabled={!chosen}
          onPress={() => update({ server: chosen?.id ?? null })}
        />
      </StepActions>
    </>
  );
}
