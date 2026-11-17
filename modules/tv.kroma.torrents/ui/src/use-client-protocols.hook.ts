import { usePoll } from '@kromatv/module-sdk';
import { useTorrentsApi } from './api.hook';
import { protocolsOf } from './protocol';

const EVERY_HALF_MINUTE = 30_000;

/** The protocols a grab can go out in, from the enabled download clients. */
export function useClientProtocols(): string[] {
  const torrents = useTorrentsApi();
  const { data } = usePoll(
    ['admin', 'downloadClients'],
    () => torrents.clients(),
    EVERY_HALF_MINUTE,
  );
  return protocolsOf(data?.clients ?? []);
}
