import { type ParseArgsOptionsConfig, parseArgs } from 'node:util';
import { type Target, targetsFrom } from '../targets';

/** What a sweep reads, where, and what it does with what it finds. */
export interface SweepOptions {
  targets: Target[];
  languages: string[] | null;
  server: string;
  seed: string | undefined;
  maxPages: number;
  report: boolean;
  catalogOnly: boolean;
  json: boolean;
}

const DEFAULT_SERVER = 'http://localhost:4040';
const DEFAULT_MAX_PAGES = 150;

/** How the sweep is called. */
export const USAGE = `usage: bun run shots:clip [options]

  --targets <list>   web, tizen or webos, comma-separated (default: web,tizen)
  --port <id>=<n>    The dev-server port of one target, e.g. --port web=3200 (repeatable)
  --langs <list>     The languages to read (default: every language i18n.json offers)
  --server <url>     The KROMA server the shells talk to (default: ${DEFAULT_SERVER})
  --seed <file>      JSON of localStorage entries for a signed-in session,
                     instead of KROMA_EMAIL and KROMA_PASSWORD
  --max-pages <n>    The most web pages the crawl visits (default: ${DEFAULT_MAX_PAGES})
  --catalog-only     List and fail on the texts of the catalogs only, not on
                     titles, names and messages the server sends
  --report           Exit 0 even when a text is clipped
  --json             Print what was found as JSON`;

const FLAGS = {
  targets: { type: 'string', default: 'web,tizen' },
  port: { type: 'string', multiple: true },
  langs: { type: 'string' },
  server: { type: 'string', default: DEFAULT_SERVER },
  seed: { type: 'string' },
  'max-pages': { type: 'string', default: String(DEFAULT_MAX_PAGES) },
  report: { type: 'boolean', default: false },
  'catalog-only': { type: 'boolean', default: false },
  json: { type: 'boolean', default: false },
} satisfies ParseArgsOptionsConfig;

function listOf(text: string): string[] {
  return text
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function count(text: string, flag: string): number {
  const value = Number(text);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${flag} takes a whole number above zero, not "${text}"\n\n${USAGE}`);
  }
  return value;
}

function portsFrom(entries: readonly string[]): Map<string, number> {
  const ports = new Map<string, number>();
  for (const entry of entries) {
    const [id = '', port = ''] = entry.split('=');
    ports.set(id, count(port, `--port ${id}`));
  }
  return ports;
}

function browserTargets(list: string, ports: ReadonlyMap<string, number>): Target[] {
  const targets = targetsFrom(list);
  const native = targets.find((target) => target.kind !== 'dom');
  if (native) {
    throw new Error(`${native.id} has no page to read: the sweep reads web, tizen and webos`);
  }
  for (const id of ports.keys()) {
    if (!targets.some((target) => target.id === id)) {
      throw new Error(`--port names ${id}, which --targets does not sweep`);
    }
  }
  return targets.map((target) => {
    const moved = structuredClone(target);
    moved.port = ports.get(target.id) ?? target.port;
    return moved;
  });
}

/** The options of a sweep, from its command line. */
export function parseOptions(argv: readonly string[]): SweepOptions {
  const { values } = parseArgs({ args: [...argv], options: FLAGS, strict: true });
  return {
    targets: browserTargets(values.targets, portsFrom(values.port ?? [])),
    languages: values.langs === undefined ? null : listOf(values.langs),
    server: new URL(values.server).origin,
    seed: values.seed,
    maxPages: count(values['max-pages'], '--max-pages'),
    report: values.report,
    catalogOnly: values['catalog-only'],
    json: values.json,
  };
}
