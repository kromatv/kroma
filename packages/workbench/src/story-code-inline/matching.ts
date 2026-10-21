// The index of the bracket closing the one at `from`, ignoring anything inside
// a string or a template, or -1 when it never closes.
function matching(text: string, from: number, open: '(' | '{'): number {
  const shut = open === '(' ? ')' : '}';
  let depth = 0;
  let quote = '';
  for (let at = from; at < text.length; at += 1) {
    const char = text[at];
    if (quote) {
      if (char === '\\') at += 1;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') quote = char;
    else if (char === open) depth += 1;
    else if (char === shut) {
      depth -= 1;
      if (depth === 0) return at;
    }
  }
  return -1;
}

export { matching };
