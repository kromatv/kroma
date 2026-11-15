/** What typing `text` into a tags entry means: the names a separator has
 * already closed, and the rest, still being typed. Each character of
 * `separators` closes a name. */
export function cutTags(text: string, separators: string): { closed: string[]; rest: string } {
  const pieces: string[] = [];
  let piece = '';
  for (const char of text) {
    if (separators.includes(char)) {
      pieces.push(piece);
      piece = '';
    } else {
      piece += char;
    }
  }
  return { closed: pieces.map((name) => name.trim()).filter(Boolean), rest: piece };
}

/** `tags` followed by each of `added` that is not blank and not there yet. */
export function withTags(tags: readonly string[], added: readonly string[]): string[] {
  const next = [...tags];
  for (const name of added.map((raw) => raw.trim())) {
    if (name && !next.includes(name)) next.push(name);
  }
  return next;
}
