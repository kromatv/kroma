import type { ImportServer } from '@kromatv/client/importers';
import { useT } from '@kromatv/ui';
import { ChoiceList, GuidedFlow } from '@kromatv/ui/kit';
import { useState } from 'react';
import { KeptSignIn } from '#web/features/admin/import/import-kept-sign-in.component';
import { ImportServerChoice } from '#web/features/admin/import/import-server-choice.component';
import { useImportSession } from '#web/features/admin/import/import-session.component';
import { useFoundServers } from '#web/features/admin/import/use-found-servers.hook';

interface ListProps {
  servers: readonly ImportServer[];
  found: readonly ImportServer[];
  picked: string | null;
  onPick: (id: string) => void;
}

function ServerList({ servers, found, picked, onPick }: Readonly<ListProps>) {
  const t = useT();
  const hintOf = (server: ImportServer) => {
    const here = found.find((near) => near.id === server.id)?.address;
    return here ? t('setup.importFoundAt', { address: here }) : undefined;
  };
  return (
    <ChoiceList.Root
      size="md"
      label={t('setup.importServersTitle')}
      value={picked}
      onValueChange={onPick}
    >
      {servers.map((server) => (
        <ImportServerChoice key={server.id} server={server} hint={hintOf(server)} />
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
  const { servers: found } = useFoundServers(session.importer);
  return (
    <>
      <GuidedFlow.Header>
        <GuidedFlow.Title>{t('setup.importServersTitle')}</GuidedFlow.Title>
        <GuidedFlow.Subtitle>{t('setup.importServersSub')}</GuidedFlow.Subtitle>
      </GuidedFlow.Header>
      <GuidedFlow.Panel>
        <ServerList servers={session.servers} found={found} picked={picked} onPick={setPicked} />
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
