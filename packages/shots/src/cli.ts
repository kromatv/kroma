// Captures one screen across the shells a change touches, and hands back the
// markdown block a PR or issue carries.
//
//   bun run shots:pr about-hardware --route about --targets web,tizen,webos
//   bun run shots:pr about-hardware --route about --targets appletv,androidtv --keys ArrowDown,Enter
//
// The DOM targets need their dev server up (`bun run dev:tizen`, …); the native
// targets need the app already installed on the simulator or emulator. Neither
// is built here: a capture tool that also builds is a build tool that sometimes
// takes pictures.

import { join } from 'node:path';
import { captureAndroid } from './android';
import { captureApple } from './apple';
import { captureDom } from './dom';
import { DEFAULT_METRO_PORT } from './metro';
import { markdown, publish } from './publish';
import { assertPng, assetName, outDirFor, type Screen, type Shot } from './shot';
import { DEFAULT_TARGETS, type Target, targetsFrom } from './targets';

const REPO_DIR = new URL('../../..', import.meta.url).pathname;
const DEFAULT_REPO = 'maxscharwath/kroma';
const DEFAULT_SETTLE_MS = 600;

const USAGE = `usage: bun run shots:pr <slug> [options]

  --route <name>     TV route to open (default: home). See TvRoutes in packages/tv/src/app/router.tsx.
  --params <json>    Params for a route that takes them, e.g. --params '{"kind":"films"}'
  --path <path>      URL path for the web client (default: /)
  --targets <list>   Comma-separated (default: ${DEFAULT_TARGETS.join(',')})
  --keys <list>      Remote keys pressed before the shutter, e.g. ArrowDown,Enter
  --settle <ms>      Extra wait before the shutter (default: ${DEFAULT_SETTLE_MS})
  --seed <file>      JSON of localStorage entries for a signed-in session
  --port <n>         Override the dev-server port (one dom target at a time)
  --metro-port <n>   Metro port for the native targets (default: ${DEFAULT_METRO_PORT})
  --publish          Upload to the issue-assets release and print the published markdown
  --repo <owner/name>`;

async function main(argv: string[]): Promise<void> {
  const [slug, ...rest] = argv;
  if (!slug || slug.startsWith('--')) throw new Error(USAGE);
  const flags = parseFlags(rest);

  const screen: Screen = {
    path: flags.path ?? '/',
    route: flags.route ?? 'home',
    params: flags.params ? JSON.parse(flags.params) : undefined,
    keys: (flags.keys ?? '')
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean),
    settleMs: Number(flags.settle ?? DEFAULT_SETTLE_MS),
  };

  const targets = targetsFrom(flags.targets ?? DEFAULT_TARGETS.join(','));
  const port = flags.port ? Number(flags.port) : undefined;
  const metroPort = flags['metro-port'] ? Number(flags['metro-port']) : DEFAULT_METRO_PORT;
  if (port !== undefined && targets.filter((t) => t.kind === 'dom').length > 1) {
    throw new Error('--port applies to one dom target at a time; narrow --targets');
  }
  const outDir = outDirFor(REPO_DIR, slug);
  const shots: Shot[] = [];

  for (const target of targets) {
    const file = join(outDir, assetName(slug, target.id));
    console.log(`${target.id} …`);
    await capture(target, screen, file, flags.seed, port, metroPort);
    assertPng(file, target.id);
    shots.push({ targetId: target.id, label: target.label, file });
    console.log(`  -> ${file}`);
  }

  const repo = flags.repo ?? DEFAULT_REPO;
  console.log(`\n${'-'.repeat(60)}\n`);
  console.log(flags.publish === '' ? publish(repo, shots, slug) : markdown(repo, shots, slug));
  if (flags.publish !== '') {
    console.log('\n(local only - pass --publish to upload and get working links)');
  }
}

function capture(
  target: Target,
  screen: Screen,
  file: string,
  seed: string | undefined,
  port: number | undefined,
  metroPort: number,
): Promise<void> {
  if (target.kind === 'dom') return captureDom(target, screen, file, seed, port);
  if (target.kind === 'apple') return captureApple(target, screen, file, metroPort);
  return captureAndroid(target, screen, file, metroPort);
}

function parseFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? '';
    if (!arg.startsWith('--')) throw new Error(`unexpected argument "${arg}"\n\n${USAGE}`);
    const name = arg.slice(2);
    const next = argv[i + 1];
    // A bare flag (--publish) takes the empty string; anything else consumes
    // the token after it.
    if (next === undefined || next.startsWith('--')) {
      flags[name] = '';
    } else {
      flags[name] = next;
      i += 1;
    }
  }
  return flags;
}

try {
  await main(process.argv.slice(2));
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
