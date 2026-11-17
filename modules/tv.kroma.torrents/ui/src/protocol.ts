/** The protocol a magnet or a `.torrent` downloads. */
export const TORRENT = 'torrent';

/** Whether a download joins a swarm, so its peers, its ratio and a re-announce
 * mean something. Only a torrent does. */
export function joinsSwarm(dl: Readonly<{ protocol: string }>): boolean {
  return dl.protocol === TORRENT;
}

/** The protocols the enabled clients take, a torrent first, or a torrent alone
 * when none has said. */
export function protocolsOf(
  clients: readonly Readonly<{ enabled: boolean; protocols: readonly string[] }>[],
): string[] {
  const taken = [...new Set(clients.filter((c) => c.enabled).flatMap((c) => c.protocols))];
  if (taken.length === 0) {
    return [TORRENT];
  }
  return taken.sort((a, b) => Number(b === TORRENT) - Number(a === TORRENT) || a.localeCompare(b));
}

type ProtocolKey = 'protocol.torrent' | 'protocol.usenet';

const LABELS = new Map<string, ProtocolKey>([
  [TORRENT, 'protocol.torrent'],
  ['usenet', 'protocol.usenet'],
]);

/** A protocol's display name: its catalog label, or the name itself for a
 * protocol this module has no label for. */
export function protocolLabel(t: (key: ProtocolKey) => string, protocol: string): string {
  const key = LABELS.get(protocol);
  return key ? t(key) : protocol;
}
