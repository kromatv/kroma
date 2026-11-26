import { type Browser, chromium } from 'playwright';
import { assertKroma } from '../dom';
import type { Target } from '../targets';
import { signedInStorage, speak, type SweepAccount } from './account';
import { inTurn } from './in-turn';
import { joined, NOTHING, type Sweep } from './screen-read';
import { tabIn } from './tab';
import type { TvScreen } from './tv-screens';
import { sweepTv } from './tv-sweep';
import type { WebRoute } from './web-routes';
import { sweepWeb } from './web-sweep';

/** Everything a sweep reads: the targets and languages, as which account,
 *  the web client's routes and the TV app's screens. */
export interface SweepPlan {
  targets: readonly Target[];
  languages: readonly string[];
  account: SweepAccount;
  routes: readonly WebRoute[];
  screens: readonly TvScreen[];
  maxPages: number;
}

type TargetRun = { plan: SweepPlan; target: Target; language: string; account: SweepAccount };

const SESSION = { 'kroma:intro-seen': '1' };
const NAVIGATION_TIMEOUT_MS = 90_000;

type StorageEntry = readonly ['localStorage' | 'sessionStorage', string, string];

function seedStorage(entries: readonly StorageEntry[]): void {
  for (const [area, key, value] of entries) {
    globalThis[area].setItem(key, value);
  }
}

function storageOf(account: SweepAccount): StorageEntry[] {
  const local = Object.entries(signedInStorage(account));
  return [
    ...local.map(([key, value]): StorageEntry => ['localStorage', key, value]),
    ...Object.entries(SESSION).map(([key, value]): StorageEntry => ['sessionStorage', key, value]),
  ];
}

function portOf(target: Target): number {
  return target.port ?? 0;
}

function originOf(target: Target): string {
  return `http://localhost:${portOf(target)}`;
}

function notServing(target: Target): Error {
  return new Error(
    `nothing answered ${originOf(target)} for "${target.id}". ` +
      `Start it with \`bun run ${target.serveScript ?? 'dev'}\` and run this again.`,
  );
}

async function sweepTarget(browser: Browser, run: TargetRun): Promise<Sweep> {
  const { plan, target, language } = run;
  const context = await browser.newContext({ viewport: target.viewport, deviceScaleFactor: 1 });
  try {
    await context.addInitScript(seedStorage, storageOf(run.account));
    context.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);
    const tab = await tabIn(context);
    const origin = originOf(target);
    if (target.routing === 'url') {
      return await sweepWeb(tab, {
        origin,
        language,
        routes: plan.routes,
        maxPages: plan.maxPages,
      });
    }
    return await sweepTv(tab, { origin, target: target.id, language, screens: plan.screens });
  } finally {
    await context.close();
  }
}

async function checkServing(browser: Browser, target: Target): Promise<void> {
  const page = await browser.newPage();
  try {
    await page
      .goto(originOf(target), { waitUntil: 'load', timeout: NAVIGATION_TIMEOUT_MS })
      .catch(() => {
        throw notServing(target);
      });
    await assertKroma(page, target, portOf(target));
  } finally {
    await page.close();
  }
}

async function sweepLanguage(browser: Browser, plan: SweepPlan, language: string): Promise<Sweep> {
  const account = await speak(plan.account, language);
  const sweeps = await inTurn(plan.targets, (target) => {
    process.stderr.write(`${language} ${target.id} …\n`);
    return sweepTarget(browser, { plan, target, language, account });
  });
  return sweeps.reduce((all, one) => joined(all, one), NOTHING);
}

/** Reads every screen of the plan in each of its languages, one language at a
 *  time: the account is set to it, then each target is read signed in as it.
 *  Writes its progress to stderr. */
export async function sweep(plan: SweepPlan): Promise<Sweep> {
  const browser = await chromium.launch();
  try {
    await Promise.all(plan.targets.map((target) => checkServing(browser, target)));
    const sweeps = await inTurn(plan.languages, (language) =>
      sweepLanguage(browser, plan, language),
    );
    return sweeps.reduce((all, one) => joined(all, one), NOTHING);
  } finally {
    await browser.close();
  }
}
