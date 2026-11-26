/// <reference lib="dom" />
import { clipsOf, type PageClip } from './clips';
import type { ReaderBox } from './schemas';

/** What reading a screen needs of a page. Playwright's `Page` is one. */
export interface ReaderPage {
  evaluate<R, A>(fn: (arg: A) => R, arg: A): Promise<R>;
  waitForFunction<A>(
    fn: (arg: A) => boolean,
    arg: A,
    options: { timeout: number },
  ): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
}

const READER = '__KROMA_UI__';
const READY_TIMEOUT_MS = 30_000;
const SETTLE_STEP_MS = 400;
const SETTLE_STEPS = 12;

function hasReader(name: string): boolean {
  return Reflect.get(globalThis, name) !== undefined;
}

function callReader(call: { name: string; method: string }): unknown {
  const reader: unknown = Reflect.get(globalThis, call.name);
  const method: unknown = reader instanceof Object ? Reflect.get(reader, call.method) : undefined;
  return typeof method === 'function' ? Reflect.apply(method, reader, []) : null;
}

function documentLanguage(): string {
  return document.documentElement.lang;
}

function speaksIn(lang: string): boolean {
  return document.documentElement.lang === lang;
}

function textsInBoxes(boxes: readonly ReaderBox[]): (string | null)[] {
  const elements = [...document.body.querySelectorAll('*')];
  return boxes.map((box) => {
    const found = elements.filter((element) => {
      const rect = element.getBoundingClientRect();
      const gaps = [
        rect.x - box.x,
        rect.y - box.y,
        rect.width - box.width,
        rect.height - box.height,
      ];
      return gaps.every((gap) => Math.abs(gap) < 1) && Boolean(element.textContent);
    });
    return found.at(-1)?.textContent ?? null;
  });
}

/** Waits until the page runs the kit's reader and speaks `language`, and says
 *  what it speaks instead when it does not in time. */
export async function speaks(page: ReaderPage, language: string): Promise<string | null> {
  await page.waitForFunction(hasReader, READER, { timeout: READY_TIMEOUT_MS });
  try {
    await page.waitForFunction(speaksIn, language, { timeout: READY_TIMEOUT_MS });
    return null;
  } catch {
    return page.evaluate(documentLanguage, undefined);
  }
}

async function settleFrom(page: ReaderPage, before: unknown, steps: number): Promise<void> {
  await page.waitForTimeout(SETTLE_STEP_MS);
  const now = await page.evaluate(callReader, { name: READER, method: 'screenText' });
  if (now !== before && steps > 1) {
    await settleFrom(page, now, steps - 1);
  }
}

/** Waits until two reads of the screen in a row say the same, or gives up
 *  after a few seconds on a screen that keeps changing. */
export function settle(page: ReaderPage): Promise<void> {
  return settleFrom(page, null, SETTLE_STEPS);
}

async function withTexts(page: ReaderPage, clips: PageClip[]): Promise<PageClip[]> {
  const missing = clips.filter((clip) => clip.text === null && clip.box !== null);
  const boxes = missing.flatMap((clip) => (clip.box ? [clip.box] : []));
  const texts = boxes.length > 0 ? await page.evaluate(textsInBoxes, boxes) : [];
  return clips.map((clip) => {
    const at = missing.indexOf(clip);
    return at === -1 ? clip : { ...clip, text: texts[at] ?? null };
  });
}

/** The clipped texts on the page, each with what it says: from its props, or
 *  from the element in its box when its props carry no one string. */
export async function clippedTexts(page: ReaderPage): Promise<PageClip[]> {
  const tree = await page.evaluate(callReader, { name: READER, method: 'describeScreen' });
  return withTexts(page, clipsOf(tree));
}
