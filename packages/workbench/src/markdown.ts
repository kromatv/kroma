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

// Split rather than scan: the capture group keeps the marked spans in place, so
// the pass cannot lose text it did not recognise. Leftmost wins, which is what
// puts a `**bold**` inside a code span on the code span's side.
const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^\s)]+\))/g;
const LINK = /^\[([^\]]+)\]\(([^\s)]+)\)$/;

/** The inline spans of one line of prose, in order. */
function segments(text: string): Segment[] {
  const out: Segment[] = [];
  for (const part of text.split(INLINE)) {
    if (!part) continue;
    const link = LINK.exec(part);
    if (link?.[1] && link[2]) {
      out.push({ text: link[1], mark: 'link', href: link[2] });
    } else if (part.startsWith('**') && part.endsWith('**')) {
      out.push({ text: part.slice(2, -2), mark: 'bold' });
    } else if (part.startsWith('`') && part.endsWith('`') && part.length > 1) {
      out.push({ text: part.slice(1, -1), mark: 'code' });
    } else {
      out.push({ text: part, mark: 'plain' });
    }
  }
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

/** The document as blocks. Consecutive non-blank lines join into one paragraph,
 * the way a soft-wrapped markdown file means them to. */
function blocks(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out: Block[] = [];
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
  const flush = () => {
    flushParagraph();
    flushList();
  };

  let at = 0;
  while (at < lines.length) {
    const line = (lines[at] ?? '').trim();
    at += 1;

    const fence = FENCE.exec(line);
    if (fence) {
      const end = closingFence(lines, at);
      // An unclosed fence falls through and stays literal, so a stray ``` cannot
      // swallow the rest of the page.
      if (end !== -1) {
        flush();
        const code = lines.slice(at, end).join('\n');
        out.push({ kind: 'code', code, ...(fence[1] ? { lang: fence[1] } : null) });
        at = end + 1;
        continue;
      }
    }

    if (!line) {
      flush();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading?.[1] && heading[2]) {
      flush();
      out.push({ kind: 'heading', level: heading[1].length === 1 ? 1 : 2, text: heading[2] });
      continue;
    }

    const bullet = BULLET.exec(line);
    if (bullet?.[1]) {
      flushParagraph();
      items.push(bullet[1]);
      continue;
    }

    flushList();
    para.push(line);
  }
  flush();
  return out;
}

export type { Block, Mark, Segment };
export { blocks, segments };
