type ProtocolKey = 'protocol.torrent' | 'protocol.usenet';

const LABELS = new Map<string, ProtocolKey>([
  ['torrent', 'protocol.torrent'],
  ['usenet', 'protocol.usenet'],
]);

/** The protocols this module has a label for, in the order it offers them. */
export const KNOWN_PROTOCOLS: readonly string[] = [...LABELS.keys()];

/** A protocol's display name: its catalog label, or the name itself for a
 * protocol this module has no label for. */
export function protocolLabel(t: (key: ProtocolKey) => string, protocol: string): string {
  const key = LABELS.get(protocol);
  return key ? t(key) : protocol;
}
