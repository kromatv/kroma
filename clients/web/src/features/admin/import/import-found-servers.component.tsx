import type { Importer, ImportServer } from '@kromatv/client/importers';
import { useT } from '@kromatv/ui';
import { Box, ChoiceList, Row, Spinner, Text } from '@kromatv/ui/kit';
import { ImportServerChoice } from '#web/features/admin/import/import-server-choice.component';
import { useFoundServers } from '#web/features/admin/import/use-found-servers.hook';

/** The sign-in field a found server's address fills in. */
export const ADDRESS_FIELD = 'url';

interface FoundProps {
  importer: Importer;
  address: string | undefined;
  onPick: (address: string) => void;
}

function Looking() {
  const t = useT();
  return (
    <Row align="center" gap={12}>
      <Spinner size={18} />
      <Text color="textMuted">{t('setup.importLooking')}</Text>
    </Row>
  );
}

interface ListProps {
  servers: readonly ImportServer[];
  address: string | undefined;
  onPick: (address: string) => void;
}

function FoundList({ servers, address, onPick }: Readonly<ListProps>) {
  const t = useT();
  const pick = (id: string) => {
    const found = servers.find((server) => server.id === id)?.address;
    if (found) {
      onPick(found);
    }
  };
  const picked = servers.find((server) => server.address === address)?.id ?? null;
  return (
    <Box gap={8}>
      <Text color="textMuted">{t('setup.importOnThisNetwork')}</Text>
      <ChoiceList.Root
        size="md"
        label={t('setup.importOnThisNetwork')}
        value={picked}
        onValueChange={pick}
      >
        {servers.map((server) => (
          <ImportServerChoice key={server.id} server={server} />
        ))}
      </ChoiceList.Root>
    </Box>
  );
}

/** The servers of its kind the importer found on the local network, for the
 * owner to pick instead of typing an address. Shown only for a form that asks
 * for one. */
export function ImportFoundServers({ importer, address, onPick }: Readonly<FoundProps>) {
  const asksAddress = importer.fields.some((field) => field.key === ADDRESS_FIELD);
  const { servers, looking } = useFoundServers(asksAddress ? importer.id : null);
  if (looking) {
    return <Looking />;
  }
  if (servers.length === 0) {
    return null;
  }
  return <FoundList servers={servers} address={address} onPick={onPick} />;
}
