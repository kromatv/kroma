import type { ImportServer } from '@kromatv/client/importers';
import { useT } from '@kromatv/ui';
import { ChoiceList } from '@kromatv/ui/kit';
import { useState } from 'react';
import { ImportFrame } from '#web/features/admin/import/import-frame.component';
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
      <ImportFrame.Header>
        <ImportFrame.Title>{t('setup.importServersTitle')}</ImportFrame.Title>
        <ImportFrame.Subtitle>{t('setup.importServersSub')}</ImportFrame.Subtitle>
      </ImportFrame.Header>
      <ImportFrame.Panel>
        <ServerList servers={session.servers} found={found} picked={picked} onPick={setPicked} />
        <KeptSignIn />
      </ImportFrame.Panel>
      <ImportFrame.Footer>
        <ImportFrame.Previous onPress={onBack} />
        <ImportFrame.Actions>
          <ImportFrame.Next
            disabled={!chosen}
            onPress={() => update({ server: chosen?.id ?? null })}
          />
        </ImportFrame.Actions>
      </ImportFrame.Footer>
    </>
  );
}
