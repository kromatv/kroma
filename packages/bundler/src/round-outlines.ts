import { type OutlineBox, readOutlineBox, ringDeclarations } from './outline-ring';

const ATTRIBUTE = 'data-kroma-ring';
const ONE_CLASS = /^\.[\w-]+$/;

type ReadBox = (element: Element) => OutlineBox;

function rulesOf(sheet: CSSStyleSheet): CSSRule[] {
  try {
    return Array.from(sheet.cssRules);
  } catch {
    return [];
  }
}

function ruleCount(sheet: CSSStyleSheet): number {
  try {
    return sheet.cssRules.length;
  } catch {
    return 0;
  }
}

function drawsOutline(rule: CSSRule): rule is CSSStyleRule {
  if (!(rule instanceof CSSStyleRule) || !ONE_CLASS.test(rule.selectorText)) {
    return false;
  }
  const style = rule.style.getPropertyValue('outline-style');
  return style !== '' && style !== 'none';
}

// Rescanned only when a sheet's rule count moves: this runs on every DOM commit,
// and the sheets change only when a style registers.
function outlineSelector(doc: Document): () => string {
  let counted = '';
  let selector = '';
  return () => {
    const sheets = Array.from(doc.styleSheets).filter((s) => s instanceof CSSStyleSheet);
    const count = sheets.map(ruleCount).join(',');
    if (count !== counted) {
      counted = count;
      const rules = sheets.flatMap(rulesOf).filter(drawsOutline);
      selector = [...new Set(rules.map((rule) => rule.selectorText))].join(',');
    }
    return selector;
  };
}

function ringSheet(doc: Document) {
  const style = doc.createElement('style');
  doc.head.appendChild(style);
  const keys = new Map<string, string>();
  return {
    keyFor(declarations: string): string {
      const known = keys.get(declarations);
      if (known) {
        return known;
      }
      const key = String(keys.size + 1);
      const at = `html [${ATTRIBUTE}="${key}"]`;
      style.sheet?.insertRule(`${at}{outline-style:none!important}`, 0);
      style.sheet?.insertRule(`${at}::after{${declarations}}`, 0);
      keys.set(declarations, key);
      return key;
    },
    remove: () => style.remove(),
  };
}

function ringMarks(doc: Document, readBox: ReadBox) {
  const sheet = ringSheet(doc);
  const settled = new Set<Element>();
  const release = (element: Element) => {
    element.removeAttribute(ATTRIBUTE);
    settled.delete(element);
  };
  const clear = () => {
    [...settled].forEach(release);
    sheet.remove();
  };
  return {
    settled,
    release,
    clear,
    settle(element: Element) {
      element.removeAttribute(ATTRIBUTE);
      const declarations = ringDeclarations(readBox(element));
      settled.add(element);
      if (declarations) {
        element.setAttribute(ATTRIBUTE, sheet.keyFor(declarations));
      }
    },
  };
}

function ringer(doc: Document, readBox: ReadBox) {
  const selector = outlineSelector(doc);
  const marks = ringMarks(doc, readBox);
  const refresh = (changed: ReadonlySet<Node>) => {
    const outlines = selector();
    const wearing = new Set(outlines ? Array.from(doc.querySelectorAll(outlines)) : []);
    for (const element of [...marks.settled].filter((e) => !wearing.has(e))) {
      marks.release(element);
    }
    for (const element of [...wearing].filter((e) => !marks.settled.has(e) || changed.has(e))) {
      marks.settle(element);
    }
  };
  const touchesRing = (record: MutationRecord) =>
    record.type === 'childList' ||
    record.attributeName === 'class' ||
    (record.target instanceof Element && marks.settled.has(record.target));
  return {
    refresh,
    observe(records: readonly MutationRecord[]) {
      if (records.some(touchesRing)) {
        refresh(new Set(records.filter((r) => r.type === 'attributes').map((r) => r.target)));
      }
    },
    dispose: marks.clear,
  };
}

/**
 * Makes every outline in `doc` follow its element's rounded corners, on an
 * engine that draws outlines square (Chromium below 94). An element wearing an
 * outline class is read when it starts wearing one and again when its classes
 * or inline style change; a rounded one has its outline hidden and redrawn by a
 * pseudo-element. Returns what undoes it.
 */
export function roundOutlines(doc: Document, read?: ReadBox): () => void {
  const view = doc.defaultView;
  if (!view) {
    return () => {};
  }
  const rings = ringer(doc, read ?? ((e) => readOutlineBox(e, view.getComputedStyle(e))));
  const observer = new view.MutationObserver((records) => rings.observe(records));
  observer.observe(doc.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'style'],
  });
  rings.refresh(new Set());
  return () => {
    observer.disconnect();
    rings.dispose();
  };
}
