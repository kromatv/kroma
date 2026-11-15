const BLANK = new Set([' ', '\n', '\t', '\r', ',']);
const DELIMITERS = new Set(['', '[', ']', '{', '}', '(', ')', '"']);
const ESCAPES = new Map([
  ['n', '\n'],
  ['t', '\t'],
  ['r', '\r'],
]);
const MAX_DEPTH = 32;

function atomValue(token: string): unknown {
  if (token === 'nil') {
    return null;
  }
  if (token === 'true' || token === 'false') {
    return token === 'true';
  }
  if (token.startsWith(':')) {
    return token.slice(1);
  }
  const number = Number(token);
  return Number.isNaN(number) ? token : number;
}

function toMap(forms: unknown[]): Record<string, unknown> {
  if (forms.length % 2 !== 0) {
    throw new Error('EDN map has a key without a value');
  }
  const entries: [string, unknown][] = [];
  for (let index = 0; index < forms.length; index += 2) {
    const key = forms[index];
    if (typeof key !== 'string') {
      throw new TypeError('EDN map key is neither a keyword nor a string');
    }
    entries.push([key, forms[index + 1]]);
  }
  return Object.fromEntries(entries);
}

class Reader {
  private at = 0;

  constructor(private readonly text: string) {}

  read(): unknown {
    const form = this.form(0);
    this.skipBlank();
    if (this.at < this.text.length) {
      throw new Error(`unexpected '${this.peek()}' after the EDN form`);
    }
    return form;
  }

  private peek(): string {
    return this.text.charAt(this.at);
  }

  private skipBlank(): void {
    while (this.at < this.text.length && BLANK.has(this.peek())) {
      this.at += 1;
    }
  }

  private form(depth: number): unknown {
    if (depth > MAX_DEPTH) {
      throw new Error('EDN nests too deep');
    }
    this.skipBlank();
    const char = this.peek();
    if (char === '{') {
      return toMap(this.sequence('}', depth));
    }
    if (char === '[') {
      return this.sequence(']', depth);
    }
    if (char === '(') {
      return this.sequence(')', depth);
    }
    return char === '"' ? this.string() : this.atom();
  }

  private sequence(close: string, depth: number): unknown[] {
    const items: unknown[] = [];
    this.at += 1;
    this.skipBlank();
    while (this.peek() !== close) {
      items.push(this.form(depth + 1));
      this.skipBlank();
    }
    this.at += 1;
    return items;
  }

  private string(): string {
    let value = '';
    this.at += 1;
    while (this.at < this.text.length) {
      const char = this.peek();
      this.at += 1;
      if (char === '"') {
        return value;
      }
      value += char === '\\' ? this.escaped() : char;
    }
    throw new Error('EDN string never closes');
  }

  private escaped(): string {
    const char = this.peek();
    this.at += 1;
    return ESCAPES.get(char) ?? char;
  }

  private atom(): unknown {
    const start = this.at;
    while (!DELIMITERS.has(this.peek()) && !BLANK.has(this.peek())) {
      this.at += 1;
    }
    if (this.at === start) {
      throw new Error(
        start < this.text.length ? `unexpected '${this.peek()}' in EDN` : 'EDN ends early',
      );
    }
    return atomValue(this.text.slice(start, this.at));
  }
}

/**
 * One EDN form as plain data: a map is an object, a vector or a list is an
 * array, a keyword is its name without the colon and `nil` is null. Covers
 * what the tools write, not the whole of EDN: no tagged literals, sets or
 * characters.
 */
export function readEdn(text: string): unknown {
  return new Reader(text).read();
}
