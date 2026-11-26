import { inTurn } from './in-turn';
import type { ReaderPage } from './page-reader';
import { joined, NOTHING, readScreen, type Sweep, unreadAt, type Where } from './screen-read';
import type { Tab } from './tab';
import { stackTop, type TvScreen } from './tv-screens';

/** One pass over the TV app's screens in one language. */
export interface TvRun {
  origin: string;
  target: string;
  language: string;
  screens: readonly TvScreen[];
}

/** What landing on a TV screen needs of a page. Playwright's `Page` is one. */
export interface TvPage extends ReaderPage {
  url(): string;
  goto(url: string, options: { waitUntil: 'load' }): Promise<unknown>;
  reload(options: { waitUntil: 'load' }): Promise<unknown>;
}

const DEV_NAV_KEY = 'kroma:dev-nav';

function storedStack(key: string): string | null {
  return sessionStorage.getItem(key);
}

function storeStack([key, stack]: readonly [string, string]): void {
  sessionStorage.setItem(key, stack);
}

function whereOf(run: TvRun, screen: TvScreen): Where {
  return { language: run.language, target: run.target, screen: screen.label };
}

async function onApp(page: TvPage, origin: string): Promise<void> {
  if (new URL(page.url()).origin !== origin) {
    await page.goto(`${origin}/`, { waitUntil: 'load' });
  }
}

async function readIn(page: TvPage, run: TvRun, screen: TvScreen): Promise<Sweep> {
  await onApp(page, run.origin);
  await page.evaluate(storeStack, [DEV_NAV_KEY, JSON.stringify(screen.stack)] as const);
  await page.reload({ waitUntil: 'load' });
  const where = whereOf(run, screen);
  const read = await readScreen(page, where);
  const landed = stackTop(await page.evaluate(storedStack, DEV_NAV_KEY));
  const wanted = screen.stack.at(-1)?.name;
  return landed === wanted ? read : unreadAt(where, `the router went to ${landed ?? 'nothing'}`);
}

async function readTvScreen(tab: Tab<TvPage>, run: TvRun, screen: TvScreen): Promise<Sweep> {
  try {
    return await tab((page) => readIn(page, run, screen));
  } catch (error: unknown) {
    return unreadAt(whereOf(run, screen), error);
  }
}

/** Lands on each screen of the TV app through the router a development build
 *  restores from `sessionStorage['kroma:dev-nav']`, and reads it. */
export async function sweepTv(tab: Tab<TvPage>, run: TvRun): Promise<Sweep> {
  const sweeps = await inTurn(run.screens, (screen) => readTvScreen(tab, run, screen));
  return sweeps.reduce(joined, NOTHING);
}
