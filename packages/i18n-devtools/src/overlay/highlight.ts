import type { Outline } from '../live';
import { perFrame } from './frame';
import { type Grade, markIn } from './mark';

/**
 * What a subtree wears to say it is a developer tool rather than the product,
 * valued with which tool it is.
 *
 * The overlay grades the strings the product draws, and a tool mounted beside
 * it has none to grade. Whoever mounts one marks it - this panel does, and a
 * shell does for anything it brings along - so that nothing here carries a list
 * of tools it has heard of, which only ever grows and never in the package that
 * would know.
 */
export const DEVTOOL = 'data-kroma-devtool';

let TOOLS = `[${DEVTOOL}]`;

/** Also treat anything `selectors` matches as a tool. For an overlay that
 *  cannot carry the attribute itself, named by the shell that mounts it. */
export function ignoreTools(selectors: readonly string[]): void {
  TOOLS = [`[${DEVTOOL}]`, ...selectors].join(',');
}
const NAME = 'kroma-i18n';
const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);
const WORDS = /[\p{L}\p{N}]/u;

/** The colour each grade is marked in, for the panel's legend. */
export const GRADE_PAINT = {
  missing: 'rgb(255 92 92)',
  vars: 'rgb(198 128 255)',
  raw: 'rgb(122 162 255)',
  fallback: 'rgb(255 186 68)',
  catalog: 'rgb(72 208 140)',
} as const satisfies Record<Grade, string>;

/** How much of that colour washes the text behind it. */
const ALPHA: Record<Grade, number> = {
  missing: 0.28,
  vars: 0.28,
  raw: 0.2,
  fallback: 0.22,
  catalog: 0.14,
};

const GRADES = Object.keys(GRADE_PAINT) as Grade[];

const CSS_RULES = GRADES.map((grade) => {
  const paint = GRADE_PAINT[grade];
  const wash = paint.replace(')', ` / ${ALPHA[grade]})`);
  return `::highlight(${NAME}-${grade}){background-color:${wash};text-decoration:underline;text-decoration-style:wavy;text-decoration-color:${paint};text-underline-offset:2px}`;
}).join('\n');

/** Whether `outline` marks a string of this grade. */
export function shows(outline: Outline, grade: Grade): boolean {
  return outline === 'all' || grade !== 'catalog';
}

/**
 * How one text node is graded, or `null` for a node nobody translates:
 * whitespace, or the punctuation a layout writes between two messages.
 *
 * Per node rather than per element: one element routinely draws several
 * messages with the layout's own punctuation between them, and punctuation is
 * nobody's translation.
 */
export function gradeOfNode(text: string): Grade | null {
  return markIn(text) ?? (WORDS.test(text) ? 'raw' : null);
}

/** Whether `node` is drawn by the page rather than by a tool watching it. */
export function onThePage(node: Node): boolean {
  const parent = node.parentElement;
  return !!parent && !SKIP.has(parent.tagName) && !parent.closest(TOOLS);
}

/**
 * Hand every graded text node the page is drawing to `take`, whatever its
 * grade: which of them a mode shows is the caller's to decide.
 *
 * The walk sees elements as well as text so that a tool's whole subtree is
 * rejected at its root, which costs one test per element rather than one per
 * text node climbing back to `<html>`.
 */
export function walkGraded(take: (grade: Grade, node: Text) => void): void {
  const walk = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.nodeValue ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
      const element = node as Element;
      return SKIP.has(element.tagName) || element.matches(TOOLS)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_SKIP;
    },
  );
  for (let node = walk.nextNode(); node; node = walk.nextNode()) {
    const grade = gradeOfNode((node as Text).data);
    if (grade) take(grade, node as Text);
  }
}

/**
 * Mark the strings on the page in the colour of what answered each, so a
 * translation that is missing - or a sentence that was never a key at all - is
 * visible where it is drawn rather than in a list somewhere else. `problems`
 * leaves the strings that are already right alone.
 *
 * Each message is marked on its own, through the browser's highlight registry:
 * one element routinely draws several, and nothing of the page's own DOM is
 * touched to say so. Returns a disposer that takes the page back.
 */
// `::highlight(name)` matches nothing while nothing is registered under that
// name, so the rules cost nothing when the overlay is down - and adding or
// removing a stylesheet dirties style for the whole document, which is a price
// worth paying once rather than on every change of mode.
let rules: HTMLStyleElement | null = null;

function installRules(): void {
  if (rules?.isConnected) return;
  rules = document.createElement('style');
  rules.textContent = CSS_RULES;
  document.head.append(rules);
}

export function installHighlight(outline: Outline): () => void {
  const registry = CSS.highlights;
  if (!registry) return () => {};

  installRules();

  const marks = new Map(GRADES.map((grade) => [grade, new Highlight()]));
  for (const [grade, highlight] of marks) registry.set(`${NAME}-${grade}`, highlight);

  // An unmarked string reads as `raw` - text no catalog ever answered - and
  // that is only true once the engine is marking at all. An engine whose
  // messages repaint through the dev server is a round trip away from its first
  // mark, and painting the whole page uncatalogued until it lands says
  // something false about every string on it. So the verdict waits for the
  // evidence: one marked string anywhere is enough to trust the rest.
  const paint = () => {
    const found: Array<[Grade, Text]> = [];
    let marked = false;
    // Filtered here rather than in the walk: `problems` hides the strings that
    // are right, and those are exactly the evidence that the engine is marking.
    walkGraded((grade, node) => {
      if (grade !== 'raw') marked = true;
      if (shows(outline, grade)) found.push([grade, node]);
    });

    // Before the clear, not after: a page with nothing marked yet is one whose
    // engine has not answered, and emptying every highlight to wait for it
    // takes the overlay off the page for as long as that takes.
    if (!marked) return;
    for (const highlight of marks.values()) highlight.clear();
    for (const [grade, node] of found) {
      marks.get(grade)?.add(
        new StaticRange({
          startContainer: node,
          startOffset: 0,
          endContainer: node,
          endOffset: node.length,
        }),
      );
    }
  };

  const repaint = perFrame(paint);
  const observer = new MutationObserver((records) => {
    if (records.some((record) => onThePage(record.target))) repaint.fire();
  });
  observer.observe(document.body, { childList: true, characterData: true, subtree: true });
  paint();

  return () => {
    observer.disconnect();
    repaint.stop();
    for (const grade of GRADES) registry.delete(`${NAME}-${grade}`);
  };
}
