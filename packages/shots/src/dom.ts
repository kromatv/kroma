import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import type { Screen } from './shot';
import type { Target } from './targets';

// The brand intro plays on a cold launch and is an OVERLAY over an app tree that
// is already mounted, so a run that skips this photographs the splash while the
// DOM underneath reports the right screen. sessionStorage, in both the TV shells
// (BrandIntro.web.tsx) and the web client (features/catalog/intro.tsx).
const INTRO_SEEN_KEY = 'kroma:intro-seen';

// Mirrored by the TV router on every navigation while `import.meta.env.DEV`,
// and read back when the provider first mounts. Seeding it is what lets a shot
// name a screen on a device whose router has no address bar.
const DEV_NAV_KEY = 'kroma:dev-nav';

const KEY_SETTLE_MS = 340;

/** A signed-in session to seed into localStorage, as a JSON object of
 * `{ "kroma.session": "…", … }` lifted off a device that is already signed in.
 * Every screen worth photographing sits behind a profile, and a TV cannot be
 * signed in from the outside. */
function seedEntries(seedPath: string | undefined): Record<string, string> {
  if (!seedPath) return {};
  const parsed: unknown = JSON.parse(readFileSync(seedPath, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${seedPath}: expected a JSON object of localStorage entries`);
  }
  const entries: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== 'string') throw new Error(`${seedPath}: "${key}" is not a string`);
    entries[key] = value;
  }
  return entries;
}

// The router restores the whole stack, so the screen is pushed on top of home:
// that is what leaves Back somewhere to go, exactly as a viewer would have it.
function navStack(screen: Screen): string {
  const top = { name: screen.route, params: screen.params };
  const stack = screen.route === 'home' ? [top] : [{ name: 'home' }, top];
  return JSON.stringify(stack);
}

export async function captureDom(
  target: Target,
  screen: Screen,
  file: string,
  seedPath: string | undefined,
  portOverride: number | undefined,
): Promise<void> {
  const { viewport } = target;
  const port = portOverride ?? target.port;
  if (!port || !viewport) throw new Error(`${target.id}: a dom target needs a port and a viewport`);
  await assertServing(port, target);

  const local = seedEntries(seedPath);
  const session: Record<string, string> = { [INTRO_SEEN_KEY]: '1' };
  if (target.routing === 'dev-nav') session[DEV_NAV_KEY] = navStack(screen);

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    page.on('pageerror', (error) => console.log(`  [pageerror] ${String(error).slice(0, 200)}`));
    await page.addInitScript(
      ([localEntries, sessionEntries]) => {
        for (const [key, value] of Object.entries(localEntries)) localStorage.setItem(key, value);
        for (const [key, value] of Object.entries(sessionEntries)) {
          sessionStorage.setItem(key, value);
        }
      },
      [local, session] as const,
    );

    const path = target.routing === 'url' ? screen.path : '/';
    await page.goto(`http://localhost:${port}${path}`, { waitUntil: 'networkidle' });
    await assertKroma(page, target, port);

    for (const key of screen.keys) {
      await page.keyboard.press(key);
      await page.waitForTimeout(KEY_SETTLE_MS);
    }
    await page.waitForTimeout(screen.settleMs);
    writeFileSync(file, await page.screenshot({ type: 'png' }));

    console.log(`  ${target.id}: ${await onScreen(page)}`);
  } finally {
    await browser.close();
  }
}

// What the frame actually says, so a run that photographed the wrong screen is
// obvious from the log instead of from the image.
async function onScreen(page: {
  locator: (selector: string) => { innerText: () => Promise<string> };
}): Promise<string> {
  const text = await page.locator('body').innerText();
  return text.replace(/[^\S\n]{0,64}\n+[^\S\n]{0,64}/g, ' · ').slice(0, 120);
}

// A dev port is a squattable thing, and photographing whatever else answered is
// the one failure that looks like success. Every shell titles itself KROMA.
async function assertKroma(
  page: { title: () => Promise<string> },
  target: Target,
  port: number,
): Promise<void> {
  const title = await page.title();
  if (/kroma/i.test(title)) return;
  throw new Error(
    `port ${port} is serving "${title || 'an untitled page'}", not KROMA. ` +
      `Something else is on that port; free it and start \`bun run ${target.serveScript}\`.`,
  );
}

async function assertServing(port: number, target: Target): Promise<void> {
  try {
    await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(2000) });
  } catch {
    throw new Error(
      `nothing is serving http://localhost:${port} for "${target.id}". ` +
        `Start it with \`bun run ${target.serveScript}\` and run this again.`,
    );
  }
}
