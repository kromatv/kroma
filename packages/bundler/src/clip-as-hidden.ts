const CLIP = /(overflow(?:-[xy])?\s*:\s*)clip\b/g;

/** A rule with `overflow: clip` spelled `hidden`, which an engine before Chromium 90 reads. */
export function clipToHidden(rule: string): string {
  return rule.replace(CLIP, '$1hidden');
}

/**
 * Rewrites `overflow: clip` to `hidden` in every rule inserted at runtime. An
 * engine before Chromium 90 drops `clip`, and a clamped text is then not
 * clipped at all: its lines run past the clamp over what follows it.
 */
export function clipAsHidden(prototype: CSSStyleSheet = CSSStyleSheet.prototype): () => void {
  const original = Object.getOwnPropertyDescriptor(prototype, 'insertRule');
  const insert: unknown = original?.value;
  if (!original || typeof insert !== 'function') {
    return () => {};
  }
  Object.defineProperty(prototype, 'insertRule', {
    ...original,
    value(this: CSSStyleSheet, rule: string, ...rest: unknown[]): number {
      return Number(Reflect.apply(insert, this, [clipToHidden(rule), ...rest]));
    },
  });
  return () => Object.defineProperty(prototype, 'insertRule', original);
}
