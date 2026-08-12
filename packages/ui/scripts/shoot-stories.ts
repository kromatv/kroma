#!/usr/bin/env bun
// Captures one screenshot per story, for visual review, against the built
// browser shell. Drives system Chrome directly: no Playwright, no test
// runner, and captures only; it does not compare.

import { spawn } from 'node:child_process';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  statSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) =>
  args
    .find((a) => a.startsWith(`--${name}=`))
    ?.split('=')
    .slice(1)
    .join('=') ?? fallback;

// Paths are resolved from the REPO ROOT, not the cwd: this runs through a
// workspace filter, so the cwd is packages/ui.
const ROOT = new URL('../../../', import.meta.url).pathname;
const dist = resolve(ROOT, flag('dir', 'apps/kit/dist'));
const out = resolve(ROOT, flag('out', 'packages/ui/.shots'));
const only = flag('only', '');
const withMatrix = args.includes('--matrix');
const PORT = 8931;

const CHROME =
  process.env.CHROME ??
  [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].find(existsSync);

if (!CHROME) {
  console.error('No Chrome found. Set CHROME=/path/to/chrome.');
  process.exit(2);
}
if (!existsSync(join(dist, 'index.html'))) {
  console.error(`No build at ${dist}. Run \`bun run build:kit\` first.`);
  process.exit(2);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'kroma-shots-'));

const CHROME_FLAGS = [
  '--headless',
  '--disable-gpu',
  '--hide-scrollbars',
  // A throwaway profile. Without it Chrome attaches to whatever instance the
  // developer already has open, and the run hangs forever instead of rendering.
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  // Fonts and the fade-in both need a beat; virtual time makes that beat
  // deterministic instead of a sleep that is too short on a loaded machine.
  '--virtual-time-budget=4000',
];

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

// Resolved through the filesystem, symlinks and all, then required to still sit
// under the build directory: an unnormalised path that merely starts with it
// can still climb out.
const SERVE_ROOT = realpathSync(dist);

function served(requested: string): string | null {
  try {
    const file = realpathSync(resolve(SERVE_ROOT, `.${sep}${requested.replace(/^[/\\]+/, '')}`));
    if (file !== SERVE_ROOT && !file.startsWith(`${SERVE_ROOT}${sep}`)) return null;
    return statSync(file).isFile() ? file : null;
  } catch {
    return null;
  }
}

// The shell is a SPA: anything that is not a real file falls through to the
// entry document, exactly as the packaged app does. node:http rather than
// Bun.serve so the script typechecks against the @types/node the repo already
// has, instead of pulling in a types package for one server.
const server = createServer((request, response) => {
  const requested = decodeURIComponent((request.url ?? '/').split('?')[0] ?? '/');
  const entry = join(dist, 'index.html');
  const file = served(requested) ?? entry;

  response.setHeader('content-type', MIME[extname(file)] ?? 'application/octet-stream');
  createReadStream(file).pipe(response);
});
server.listen(PORT);

const DEADLINE_MS = 20_000;

// Async, not sync: the static server above runs on this process's event loop,
// so a synchronous spawn would block it and Chrome would wait forever for a
// page that can never be served. Resolves when `isDone` says the screenshot
// landed rather than when Chrome exits, since headless Chrome keeps running as
// long as react-native-web has a pending animation timer.
function chrome(extraArgs: string[], isDone: (out: string) => boolean): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(CHROME as string, [...CHROME_FLAGS, ...extraArgs]);
    let out = '';
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      clearTimeout(deadline);
      child.kill('SIGKILL');
      resolve(out);
    };
    child.stdout.on('data', (chunk) => {
      out += chunk;
    });
    const poll = setInterval(() => {
      if (isDone(out)) finish();
    }, 150);
    const deadline = setTimeout(finish, DEADLINE_MS);
    child.on('close', finish);
  });
}

// Ask the app itself what there is to capture: `?shot` with no story renders
// the id list, so there is no generated manifest to fall out of sync with the
// stories on disk.
const ID_MARKER = /KROMA_STORY_IDS:([a-z0-9,-]*)/;

async function discoverIds(): Promise<string[]> {
  const dump = await chrome([`--dump-dom`, `http://localhost:${PORT}/?shot`], (out) =>
    ID_MARKER.test(out),
  );
  return ID_MARKER.exec(dump)?.[1]?.split(',').filter(Boolean) ?? [];
}

const wanted = only ? only.split(',') : await discoverIds();
if (wanted.length === 0) {
  console.error('No stories found. Is the build up to date?');
  server.close();
  process.exit(1);
}
const shots = wanted.flatMap((id) =>
  withMatrix
    ? [
        { id, name: id, query: '' },
        { id, name: `${id}--matrix`, query: '&view=matrix' },
      ]
    : [{ id, name: id, query: '' }],
);

let failed = 0;
for (const shot of shots) {
  const url = `http://localhost:${PORT}/?shot&story=${shot.id}${shot.query}`;
  const target = join(out, `${shot.name}.png`);
  await chrome(['--window-size=1280,800', `--screenshot=${target}`, url], () => existsSync(target));
  if (existsSync(target)) console.log(`  ${shot.name}`);
  else {
    failed++;
    console.error(`  ${shot.name} FAILED (no image after ${DEADLINE_MS}ms)`);
  }
}

server.close();
rmSync(profile, { recursive: true, force: true });
console.log(`\n${shots.length - failed}/${shots.length} captured -> ${out}`);
process.exit(failed ? 1 : 0);
