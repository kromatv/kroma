import { writeFileSync } from 'node:fs';
import { resolveServer, type ServerOptions } from '../server';

const WINDOWS = ['1h', '24h', '7d', '30d'] as const;

interface PerfOptions extends ServerOptions {
  window?: string;
  format?: string;
  out?: string;
}

function windowOf(given: string | undefined): string {
  const window = given ?? '24h';
  if (!WINDOWS.some((one) => one === window)) {
    throw new Error(`--window takes one of ${WINDOWS.join(', ')}, not ${window}`);
  }
  return window;
}

function formatOf(given: string | undefined): 'jsonl' | 'md' {
  if (given === undefined || given === 'jsonl') {
    return 'jsonl';
  }
  if (given === 'md') {
    return 'md';
  }
  throw new Error(`--format takes jsonl or md, not ${given}`);
}

/** `kroma perf`: what the server's profiler measured, as one JSON record per
 *  line (or a Markdown summary), written to `--out` or the standard output, for
 *  a person or a model to sort and search. */
export async function perfCommand(options: PerfOptions): Promise<number> {
  const server = resolveServer(options);
  const query = new URLSearchParams({
    window: windowOf(options.window),
    format: formatOf(options.format),
  });
  const res = await fetch(`${server.url}/api/admin/performance/export?${query}`, {
    headers: { authorization: `Bearer ${server.token}` },
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`export failed (${res.status}): ${body.trim()}`);
  }
  if (options.out) {
    writeFileSync(options.out, body);
  } else {
    process.stdout.write(body);
  }
  return 0;
}
