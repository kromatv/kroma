// The markdown a story's documentation is written in, parsed into blocks and
// inline spans. One pass, no dependency: remark and marked emit a DOM, and the
// native workbench has none - everything here is rendered through <Text>/<Box>
// by `docs.tsx`, so it works on every target the kit does, television included.
//
// The subset is what a component's documentation actually uses: paragraphs,
// `#`/`##` headings, `-` lists, fenced code, links, **bold** and `code`.
// Anything unclosed stays literal rather than eating the rest of the file.

/** An inline span's kind. `link` is the only one carrying a `href`. */
type Mark = 'plain' | 'bold' | 'code' | 'link';

interface Segment {
  text: string;
  mark: Mark;
  href?: string;
}

/** One block of prose, in document order. */
type Block =
  | { kind: 'heading'; level: 1 | 2; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'code'; code: string; lang?: string };

// Scanned by hand rather than split on one alternation. A regex that looks for
// a closing delimiter rescans from every position that could open one, which is
// quadratic on a line of unclosed `[`, and no bound on the run expresses that to
// the engine - it only caps how far each rescan goes. The scanner below reads
// each character once and looks ahead a fixed window for the close, so the work
// is bounded by construction.
//
// The window doubles as the real limit: an inline span longer than this is prose
// that wanted a paragraph.
const SPAN = 400;

const WHITESPACE = /\s/;

// -1 when `needle` is not within a span's reach of `from`. The slice is what
// bounds the search: `indexOf` alone would walk to the end of the line before
// answering that it is not there.
function within(text: string, needle: string, from: number): number {
  const at = text.slice(from, from + SPAN + needle.length).indexOf(needle);
  return at === -1 ? -1 : from + at;
}

// The index just past a `` `code` `` opening at `at`, or -1.
function codeSpan(text: string, at: number): number {
  const close = within(text, '`', at + 1);
  return close === -1 || close === at + 1 ? -1 : close + 1;
}

// The index just past a `**bold**` opening at `at`, or -1. A lone `*` inside is
// not bold: `**a*b**` is three stars and a word, the way markdown reads it.
function boldSpan(text: string, at: number): number {
  if (!text.startsWith('**', at)) return -1;
  const close = within(text, '**', at + 2);
  if (close === -1 || close === at + 2) return -1;
  return text.slice(at + 2, close).includes('*') ? -1 : close + 2;
}

interface Link {
  end: number;
  label: string;
  href: string;
}

function linkSpan(text: string, at: number): Link | null {
  const close = within(text, ']', at + 1);
  if (close === -1 || close === at + 1 || text[close + 1] !== '(') return null;
  const paren = within(text, ')', close + 2);
  if (paren === -1 || paren === close + 2) return null;
  const href = text.slice(close + 2, paren);
  if (WHITESPACE.test(href)) return null;
  return { end: paren + 1, label: text.slice(at + 1, close), href };
}

/** The inline spans of one line of prose, in order. */
function segments(text: string): Segment[] {
  const out: Segment[] = [];
  let plain = '';
  const flush = () => {
    if (plain) out.push({ text: plain, mark: 'plain' });
    plain = '';
  };

  let at = 0;
  while (at < text.length) {
    const char = text[at];
    if (char === '`') {
      const end = codeSpan(text, at);
      if (end !== -1) {
        flush();
        out.push({ text: text.slice(at + 1, end - 1), mark: 'code' });
        at = end;
        continue;
      }
    } else if (char === '*') {
      const end = boldSpan(text, at);
      if (end !== -1) {
        flush();
        out.push({ text: text.slice(at + 2, end - 2), mark: 'bold' });
        at = end;
        continue;
      }
    } else if (char === '[') {
      const link = linkSpan(text, at);
      if (link) {
        flush();
        out.push({ text: link.label, mark: 'link', href: link.href });
        at = link.end;
        continue;
      }
    }
    plain += char;
    at += 1;
  }

  flush();
  return out;
}

const FENCE = /^```(\S*)$/;
const HEADING = /^(#{1,2})\s+(\S.*)$/;
const BULLET = /^-\s+(\S.*)$/;

function closingFence(lines: readonly string[], from: number): number {
  for (let at = from; at < lines.length; at += 1) {
    if ((lines[at] ?? '').trim().startsWith('```')) return at;
  }
  return -1;
}

interface Fenced {
  block: Block;
  next: number;
}

function fencedBlock(line: string, lines: readonly string[], from: number): Fenced | null {
  const fence = FENCE.exec(line);
  if (!fence) return null;
  const end = closingFence(lines, from);
  // An unclosed fence falls through and stays literal, so a stray ``` cannot
  // swallow the rest of the page.
  if (end === -1) return null;
  const code = lines.slice(from, end).join('\n');
  return {
    block: { kind: 'code', code, ...(fence[1] ? { lang: fence[1] } : null) },
    next: end + 1,
  };
}

function headingBlock(line: string): Block | null {
  const heading = HEADING.exec(line);
  if (!heading?.[1] || !heading[2]) return null;
  return { kind: 'heading', level: heading[1].length === 1 ? 1 : 2, text: heading[2] };
}

function bulletItem(line: string): string | null {
  return BULLET.exec(line)?.[1] ?? null;
}

interface Pending {
  paragraph(line: string): void;
  item(text: string): void;
  flush(): void;
}

function pendingBlocks(out: Block[]): Pending {
  let para: string[] = [];
  let items: string[] = [];

  const flushParagraph = () => {
    if (para.length > 0) out.push({ kind: 'paragraph', text: para.join(' ') });
    para = [];
  };
  const flushList = () => {
    if (items.length > 0) out.push({ kind: 'list', items });
    items = [];
  };

  return {
    paragraph(line) {
      flushList();
      para.push(line);
    },
    item(text) {
      flushParagraph();
      items.push(text);
    },
    flush() {
      flushParagraph();
      flushList();
    },
  };
}

/** The document as blocks. Consecutive non-blank lines join into one paragraph,
 * the way a soft-wrapped markdown file means them to. */
function blocks(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out: Block[] = [];
  const pending = pendingBlocks(out);

  let at = 0;
  while (at < lines.length) {
    const line = (lines[at] ?? '').trim();
    at += 1;

    const fenced = fencedBlock(line, lines, at);
    if (fenced) {
      pending.flush();
      out.push(fenced.block);
      at = fenced.next;
      continue;
    }

    if (!line) {
      pending.flush();
      continue;
    }

    const heading = headingBlock(line);
    if (heading) {
      pending.flush();
      out.push(heading);
      continue;
    }

    const item = bulletItem(line);
    if (item) pending.item(item);
    else pending.paragraph(line);
  }

  pending.flush();
  return out;
}

export type { Block, Mark, Segment };
export { blocks, segments };
