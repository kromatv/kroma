import type { Page } from 'playwright';
import { read } from './read';
import { type Reading, ringedTab } from './reading';
import type { Remote } from './walk';

const SETTLE_MS = 220;
const BAND_SETTLE_MS = 400;
const POLL_MS = 250;
const READY_MS = 45_000;
const BAND_PRESSES = 6;

async function press(page: Page, key: string, settleMs = SETTLE_MS): Promise<void> {
  await page.keyboard.press(key);
  await page.waitForTimeout(settleMs);
}

// A dev server compiles on demand, so how long a screen takes to arrive is a
// property of the machine and not of the app. Every wait here is a condition
// with a deadline rather than a duration, or a cold run measures a half-mounted
// tree and calls it a reading.
async function until(page: Page, ready: (seen: Reading) => boolean, what: string): Promise<void> {
  const deadline = Date.now() + READY_MS;
  while (Date.now() < deadline) {
    if (ready(await read(page))) return;
    await page.waitForTimeout(POLL_MS);
  }
  throw new Error(`${what} never happened within ${READY_MS}ms`);
}

async function focusedTab(page: Page): Promise<string | null> {
  return ringedTab(await read(page));
}

async function tabLabels(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('[role="tab"]')].map((el) => el.getAttribute('aria-label') ?? ''),
  );
}

/** The page as the walk drives it: one press, then one reading, both settled. */
export function remote(page: Page): Remote {
  return { press: (key) => press(page, key), read: () => read(page) };
}

export async function boot(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await until(page, (seen) => seen.rings > 0, 'the app never took focus');
}

/**
 * Drive the remote from wherever focus sits to the top-bar destination
 * `label` names, and open it. Pressed rather than clicked: a pointer click
 * navigates but leaves the destination with nothing focused, which is not a
 * state any viewer can reach.
 */
export async function openDestination(page: Page, label: string): Promise<void> {
  for (let up = 0; up < BAND_PRESSES && !(await focusedTab(page)); up += 1) {
    await press(page, 'ArrowUp', BAND_SETTLE_MS);
  }
  const from = await focusedTab(page);
  if (!from) throw new Error('the top bar never took focus; no tab is wearing the ring');

  const labels = await tabLabels(page);
  const to = labels.indexOf(label);
  if (to === -1) {
    throw new Error(`no top-bar destination "${label}"; the bar reads ${labels.join(', ')}`);
  }
  const step = to - labels.indexOf(from);
  for (let at = 0; at < Math.abs(step); at += 1) {
    await press(page, step > 0 ? 'ArrowRight' : 'ArrowLeft');
  }

  const landed = await focusedTab(page);
  if (landed !== label) throw new Error(`the ring stopped on "${landed}", not "${label}"`);
  await press(page, 'Enter');
  await until(page, (seen) => ringedTab(seen) === null, `"${label}" never took the focus`);
}
