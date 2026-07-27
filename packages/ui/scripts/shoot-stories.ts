#!/usr/bin/env bun
// Captures one screenshot per story, for visual review.
//
// No new dependency: it serves the already-built browser shell and drives the
// Chrome that is on the machine anyway. Storybook's equivalent pulls in
// Playwright plus a test runner plus a manager protocol; this is a static
// server and a subprocess, and it captures the SAME components the TVs ship
// because it points at a real build rather than at a bespoke dev server.
//
// The `?shot` mode of the workbench renders the story alone, with no sidebar,
// no header and no panel, so what lands in the PNG is the component.
//
//   bun run shots                 capture every story
//   bun run shots -- --matrix     capture the variant matrices too
//   bun run shots -- --only=button,chip
//
// It captures; it does not compare. A pixel diff across Chrome versions is
// noise, so these are made to be LOOKED AT (and dropped into a review), not
// gated on. Behaviour is what the unit tests are for.

import { spawn } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
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
const dist = resolve(ROOT, flag('dir', 'clients/kit/dist'));
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

// The shell is a SPA: anything that is not a real file falls through to the
// entry document, exactly as the packaged app does. node:http rather than
// Bun.serve so the script typechecks against the @types/node the repo already
// has, instead of pulling in a types package for one server.
const server = createServer((request, response) => {
  const requested = decodeURIComponent((request.url ?? '/').split('?')[0] ?? '/');
  const entry = join(dist, 'index.html');

  // Containment, INLINE at the sink rather than behind a helper.
  //
  // `join(dist, requested)` is not containment: the path comes off the wire and
  // `/../../../etc/passwd` walks straight out of the build directory. Leading
  // separators are stripped so the request is always relative, and the resolved
  // result is then proven to still sit under the root - which is the only check
  // that holds, since `..` can appear anywhere in the path, not just at the
  // front. The shell is a SPA, so anything that is not a real file inside dist -
  // a route, or an attempt to escape - falls through to the entry document.
  let file = entry;
  if (requested !== '/') {
    const candidate = resolve(dist, `.${sep}${requested.replace(/^[/\\]+/, '')}`);
    if (candidate === dist || candidate.startsWith(`${dist}${sep}`)) file = candidate;
  }
  if (!existsSync(file) || !statSync(file).isFile()) file = entry;

  response.setHeader('content-type', MIME[extname(file)] ?? 'application/octet-stream');
  createReadStream(file).pipe(response);
});
server.listen(PORT);

/** How long to let one Chrome run before giving up on it entirely. */
const DEADLINE_MS = 20_000;

/**
 * Runs Chrome and resolves as soon as `isDone` says the result has arrived,
 * killing the process at that point.
 *
 * Two things are deliberate. It is ASYNCHRONOUS, and that is not a style choice:
 * the static server above runs on this process's event loop, so a synchronous
 * spawn would block it and Chrome would wait forever for a page that can never
 * be served. And it does not wait for Chrome to EXIT, because headless Chrome
 * reliably writes its screenshot and then keeps running: react-native-web drives
 * its animations from timers, and a page that always has one pending is a page
 * Chrome never considers finished. Waiting on the artefact instead of on the
 * process turns a 20-second hang per story into about two seconds.
 */
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

/** Ask the app itself what there is to capture: `?shot` with no story renders
 * the id list and nothing else. No generated manifest, and no second source of
 * truth that could fall behind the stories on disk. */
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
