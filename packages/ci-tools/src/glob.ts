const SPECIAL = /[.+^$()|[\]\\]/g;

function alternatives(body: string): string {
  return `(?:${body.split(',').map(translate).join('|')})`;
}

function token(glob: string, at: number): [piece: string, width: number] {
  const ch = glob[at] ?? '';
  if (ch === '{') {
    const end = glob.indexOf('}', at);
    if (end === -1) throw new Error(`unclosed brace in '${glob}'`);
    return [alternatives(glob.slice(at + 1, end)), end - at + 1];
  }
  if (glob.startsWith('**/', at)) return ['(?:.*/)?', 3];
  if (glob.startsWith('**', at)) return ['.*', 2];
  if (ch === '*') return ['[^/]*', 1];
  if (ch === '?') return ['[^/]', 1];
  return [ch.replace(SPECIAL, String.raw`\$&`), 1];
}

function translate(glob: string): string {
  let out = '';
  let at = 0;
  while (at < glob.length) {
    const [piece, width] = token(glob, at);
    out += piece;
    at += width;
  }
  return out;
}

/**
 * Compiles one path glob. `**` spans directories, `*` and `?` stop at a slash,
 * `{a,b}` is a choice. Matches the whole path, never a substring.
 */
export function compile(glob: string): RegExp {
  return new RegExp(`^${translate(glob)}$`);
}

/** Whether `path` matches any of `globs`. */
export function matchesAny(path: string, globs: readonly string[]): boolean {
  return globs.some((glob) => compile(glob).test(path));
}
