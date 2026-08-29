import type { Page } from 'playwright';
import { type Reading, readDocument } from './reading';

export interface Frames {
  fps: number;
  worstFrame: number;
  jankyFrames: number;
  frameCount: number;
  responseP50: number;
  responseWorst: number;
}

const CONTROLS = '[role="button"],[role="tab"],[role="link"],[role="menuitem"],[role="switch"]';

const OBSERVER_DEADLINE_MS = 300;

export async function read(page: Page): Promise<Reading> {
  return page.evaluate(readDocument, { controls: CONTROLS, wait: OBSERVER_DEADLINE_MS });
}

/** The app's own frame counter (`packages/ui/src/lib/perf.ts`), or null where
 * the global is missing, which means the run measured nothing. */
export async function frames(page: Page): Promise<Frames | null> {
  return page.evaluate(() => {
    const perf = (globalThis as { KROMA_PERF?: { report(): Frames } }).KROMA_PERF;
    if (!perf) return null;
    const { fps, worstFrame, jankyFrames, frameCount, responseP50, responseWorst } = perf.report();
    return { fps, worstFrame, jankyFrames, frameCount, responseP50, responseWorst };
  });
}

export async function startFrames(page: Page): Promise<void> {
  await page.evaluate(() => {
    const perf = (globalThis as { KROMA_PERF?: { reset(): void; start(): void } }).KROMA_PERF;
    perf?.reset();
    perf?.start();
  });
}
