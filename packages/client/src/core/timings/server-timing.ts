interface ServerTiming {
  route: string;
  serverMs: number;
}

function field(entry: string, name: string): string | undefined {
  const prefix = `${name}=`;
  const part = entry
    .split(';')
    .map((piece) => piece.trim())
    .find((piece) => piece.startsWith(prefix));
  return part?.slice(prefix.length).replace(/^"|"$/g, '');
}

/** `null` unless the header names both the route (`scope;desc=`) and the total
 *  (`total;dur=`), which only a KROMA server measuring itself sends. */
export function readServerTiming(header: string | null): ServerTiming | null {
  if (!header) {
    return null;
  }
  const entries = header.split(',').map((entry) => entry.trim());
  const total = entries.find((entry) => entry.startsWith('total;'));
  const scope = entries.find((entry) => entry.startsWith('scope;'));
  const serverMs = Number(total ? field(total, 'dur') : Number.NaN);
  const route = scope ? field(scope, 'desc') : undefined;
  return route && Number.isFinite(serverMs) ? { route, serverMs } : null;
}
