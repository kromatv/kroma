import { type GapLayout, type Gaps, NO_GAPS } from './gap-layout';
import { GAP_MARKER } from './gap-marker';

const MARKED = new RegExp(String.raw`\.([\w-]+)\[${GAP_MARKER}="([^"|]*)\|([^"]*)"\]`, 'g');

function rulesOf(sheet: CSSStyleSheet): CSSRule[] {
  try {
    return Array.from(sheet.cssRules);
  } catch {
    return [];
  }
}

function markedClasses(sheets: readonly CSSStyleSheet[]): Map<string, Gaps> {
  const classes = new Map<string, Gaps>();
  for (const rule of sheets.flatMap(rulesOf)) {
    const selector = rule instanceof CSSStyleRule ? rule.selectorText : '';
    MARKED.lastIndex = 0;
    for (let found = MARKED.exec(selector); found; found = MARKED.exec(selector)) {
      classes.set(found[1] ?? '', { row: found[2] ?? '', column: found[3] ?? '' });
    }
  }
  return classes;
}

const linkedSheets = (doc: Document) => () =>
  Array.from(doc.styleSheets).filter(
    (sheet): sheet is CSSStyleSheet => sheet instanceof CSSStyleSheet && sheet.href !== null,
  );

function gapClasses(sheets: () => readonly CSSStyleSheet[]) {
  let counted = '';
  let classes = new Map<string, Gaps>();
  let selector = '';
  return () => {
    const now = sheets();
    const count = now.map((sheet) => rulesOf(sheet).length).join(',');
    const changed = count !== counted;
    if (changed) {
      counted = count;
      classes = markedClasses(now);
      selector = Array.from(classes.keys(), (name) => `.${name}`).join(',');
    }
    return { classes, selector, changed };
  };
}

function classChecker(layout: GapLayout) {
  const spaced = new WeakSet<Element>();
  const check = (element: Element, classes: Map<string, Gaps>) => {
    if (!(element instanceof HTMLElement)) {
      return;
    }
    const name = Array.from(element.classList).find((one) => classes.has(one));
    if (name) {
      spaced.add(element);
      layout.write(element, 'class', classes.get(name) ?? NO_GAPS);
    } else if (spaced.has(element)) {
      spaced.delete(element);
      layout.write(element, 'class', NO_GAPS);
    }
  };
  const sweep = (root: Element, classes: Map<string, Gaps>, selector: string) => {
    check(root, classes);
    if (selector) {
      for (const element of Array.from(root.querySelectorAll(selector))) {
        check(element, classes);
      }
    }
  };
  return { check, sweep };
}

function visit(
  record: MutationRecord,
  on: { check: (element: Element) => void; sweep: (element: Element) => void },
): void {
  if (record.type === 'attributes' && record.target instanceof Element) {
    on.check(record.target);
  }
  for (const node of Array.from(record.addedNodes)) {
    if (node instanceof Element) {
      on.sweep(node);
    }
  }
}

/**
 * Hands `layout` the gaps a build moved out of its gap classes. The build
 * keeps each `gap` for the engines that read it and marks its class with
 * {@link GAP_MARKER}; this finds the elements wearing a marked class as they
 * mount or change class, and lets go of those that drop it.
 */
export function classGaps(
  doc: Document,
  layout: GapLayout,
  sheets: () => readonly CSSStyleSheet[] = linkedSheets(doc),
): () => void {
  const current = gapClasses(sheets);
  const { check, sweep } = classChecker(layout);
  const observer = new MutationObserver((records) => {
    const { classes, selector, changed } = current();
    if (changed) {
      sweep(doc.documentElement, classes, selector);
      return;
    }
    for (const record of records) {
      visit(record, {
        check: (element) => check(element, classes),
        sweep: (element) => sweep(element, classes, selector),
      });
    }
  });
  observer.observe(doc.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });
  return () => observer.disconnect();
}
