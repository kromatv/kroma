const cache = new WeakMap<Element, CSSStyleDeclaration>();

/** `getComputedStyle`, memoised for the life of one mounted tree. Both passes
 * over a view (its cost and its paint) ask every element for its style, and in
 * jsdom that call is the whole cost of the audit. */
function styleOf(el: Element): CSSStyleDeclaration {
  const known = cache.get(el);
  if (known) return known;
  const style = getComputedStyle(el);
  cache.set(el, style);
  return style;
}

export { styleOf };
