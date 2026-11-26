import type { ReaderPage } from './page-reader';
import { joined, NOTHING, readScreen, type Sweep, unreadAt } from './screen-read';
import type { Tab } from './tab';
import { crawlSeeds, linkPath, unseenPages, type WebRoute } from './web-routes';

/** One crawl of the web client in one language. */
export interface WebRun {
  origin: string;
  language: string;
  routes: readonly WebRoute[];
  maxPages: number;
}

/** What crawling a web page needs of a page. Playwright's `Page` is one. */
export interface WebPage extends ReaderPage {
  url(): string;
  goto(url: string, options: { waitUntil: 'load' }): Promise<unknown>;
  $$eval<R>(selector: string, fn: (elements: Element[]) => R): Promise<R>;
}

type PageRead = { sweep: Sweep; links: string[] };

type Crawl = { queue: string[]; seen: Set<string>; found: Sweep; budget: number };

async function linksOn(page: WebPage, origin: string): Promise<string[]> {
  const hrefs = await page.$$eval('a[href]', (anchors) =>
    anchors.map((anchor) => anchor.getAttribute('href') ?? ''),
  );
  return hrefs.flatMap((href) => linkPath(href, origin) ?? []);
}

function screenOf(path: string, page: WebPage): string {
  const landed = new URL(page.url()).pathname;
  return landed === path ? path : `${path} -> ${landed}`;
}

async function readIn(page: WebPage, run: WebRun, path: string): Promise<PageRead> {
  await page.goto(`${run.origin}${path}`, { waitUntil: 'load' });
  const where = { language: run.language, target: 'web', screen: screenOf(path, page) };
  const sweep = await readScreen(page, where);
  return { sweep, links: await linksOn(page, run.origin) };
}

async function readPage(tab: Tab<WebPage>, run: WebRun, path: string): Promise<PageRead> {
  try {
    return await tab((page) => readIn(page, run, path));
  } catch (error: unknown) {
    const where = { language: run.language, target: 'web', screen: path };
    return { sweep: unreadAt(where, error), links: [] };
  }
}

/** Visits every page of the web client a crawl reaches from its route table,
 *  one page per route that takes a param, and reads each. */
export function sweepWeb(tab: Tab<WebPage>, run: WebRun): Promise<Sweep> {
  const seen = new Set<string>();
  const queue = unseenPages(crawlSeeds(run.routes), seen, run.routes);
  return crawl(tab, run, { queue, seen, found: NOTHING, budget: run.maxPages });
}

async function crawl(tab: Tab<WebPage>, run: WebRun, state: Crawl): Promise<Sweep> {
  const [path, ...queue] = state.queue;
  if (path === undefined || state.budget === 0) {
    return state.found;
  }
  const read = await readPage(tab, run, path);
  const next = [...queue, ...unseenPages(read.links, state.seen, run.routes)];
  const found = joined(state.found, read.sweep);
  return crawl(tab, run, { ...state, queue: next, found, budget: state.budget - 1 });
}
