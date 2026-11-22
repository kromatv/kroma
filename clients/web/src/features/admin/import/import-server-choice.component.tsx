import type { ImportServer } from '@kromatv/client/importers';
import { ChoiceList } from '@kromatv/ui/kit';

interface ChoiceProps {
  server: ImportServer;
  hint?: string;
}

/** One server to pick, by name, with its address or the hint given instead. */
export function ImportServerChoice({ server, hint }: Readonly<ChoiceProps>) {
  const said = hint ?? server.address;
  return (
    <ChoiceList.Item value={server.id}>
      <ChoiceList.Label>{server.name}</ChoiceList.Label>
      {said ? <ChoiceList.Hint>{said}</ChoiceList.Hint> : null}
    </ChoiceList.Item>
  );
}
