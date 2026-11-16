/** The protocol a magnet or a `.torrent` downloads. */
export const TORRENT = 'torrent';

/** Whether a download joins a swarm, so its peers, its ratio and a re-announce
 * mean something. Only a torrent does. */
export function joinsSwarm(dl: Readonly<{ protocol: string }>): boolean {
  return dl.protocol === TORRENT;
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
