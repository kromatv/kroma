import { NAME } from './head';

interface Conditional {
  name: string;
  whenTrue: string;
  whenFalse: string;
}

// `name ? a : b`, found by scanning rather than by a pattern: two greedy runs
// either side of a colon backtrack quadratically over anything that is not one.
function conditional(inner: string): Conditional | null {
  const ask = inner.indexOf('?');
  if (ask < 0) return null;
  const name = inner.slice(0, ask).trim();
  if (!NAME.test(name)) return null;
  const colon = answering(inner, ask + 1);
  if (colon < 0) return null;
  return { name, whenTrue: inner.slice(ask + 1, colon), whenFalse: inner.slice(colon + 1) };
}

const QUOTES = new Set(['"', "'", '`']);

const OPENS = new Set(['(', '{', '[', '?']);
const SHUTS = new Set([')', '}', ']']);

// The colon belonging to the question mark this started from: the first one
// outside every bracket, string and nested conditional.
function answering(text: string, from: number): number {
  let depth = 0;
  let quote = '';
  for (let at = from; at < text.length; at += 1) {
    const char = text[at] as string;
    if (quote) {
      if (char === '\\') at += 1;
      else if (char === quote) quote = '';
    } else if (QUOTES.has(char)) quote = char;
    else if (OPENS.has(char)) depth += 1;
    else if (SHUTS.has(char)) depth -= 1;
    else if (char === ':') {
      if (depth === 0) return at;
      depth -= 1;
    }
  }
  return -1;
}

export { conditional };
