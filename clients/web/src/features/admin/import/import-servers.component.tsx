import type { ImportServer } from '@kromatv/client/importers';
import { useT } from '@kromatv/ui';
import { ChoiceList, GuidedFlow } from '@kromatv/ui/kit';
import { useState } from 'react';
import { KeptSignIn } from '#web/features/admin/import/import-kept-sign-in.component';
import { useImportSession } from '#web/features/admin/import/import-session.component';

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
      <GuidedFlow.Header>
        <GuidedFlow.Title>{t('setup.importServersTitle')}</GuidedFlow.Title>
        <GuidedFlow.Subtitle>{t('setup.importServersSub')}</GuidedFlow.Subtitle>
      </GuidedFlow.Header>
      <GuidedFlow.Panel>
        <ServerList servers={session.servers} picked={picked} onPick={setPicked} />
        <KeptSignIn />
      </GuidedFlow.Panel>
      <GuidedFlow.Footer>
        <GuidedFlow.Previous onPress={onBack} />
        <GuidedFlow.Actions>
          <GuidedFlow.Next
            disabled={!chosen}
            onPress={() => update({ server: chosen?.id ?? null })}
          />
        </GuidedFlow.Actions>
      </GuidedFlow.Footer>
    </>
  );
}
