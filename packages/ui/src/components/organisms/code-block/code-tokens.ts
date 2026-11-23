import { parser } from '@lezer/javascript';
import { highlightTree, styleTags, tagHighlighter, tags as t } from '@lezer/highlight';

const KINDS = ['plain', 'tag', 'attr', 'string', 'keyword', 'number', 'brace', 'comment'] as const;

/** What a run of code was recognised as, which is the only thing the painter
 * reads. */
type TokenKind = (typeof KINDS)[number];

interface Token {
  text: string;
  kind: TokenKind;
}

const tsx = parser.configure({
  dialect: 'jsx ts',
  props: [styleTags({ 'JSXMemberExpression/"."': t.tagName })],
});

const highlighter = tagHighlighter([
  { tag: [t.angleBracket, t.tagName], class: 'tag' },
  { tag: t.attributeName, class: 'attr' },
  { tag: [t.string, t.special(t.string), t.escape, t.regexp], class: 'string' },
  { tag: [t.keyword, t.bool, t.null], class: 'keyword' },
  { tag: t.number, class: 'number' },
  { tag: [t.paren, t.brace, t.squareBracket], class: 'brace' },
  { tag: [t.lineComment, t.blockComment], class: 'comment' },
]);

function isKind(name: string): name is TokenKind {
  return KINDS.some((kind) => kind === name);
}

function kindOf(classes: string): TokenKind {
  return isKind(classes) ? classes : 'plain';
}

/** Every character of `code`, in order and with nothing lost: the tokens
 * concatenate back to the input. */
function tokenize(code: string): Token[] {
  const out: Token[] = [];
  let at = 0;
  const push = (to: number, kind: TokenKind) => {
    const text = code.slice(at, to);
    const last = out.at(-1);
    if (last?.kind === kind) {
      last.text += text;
    } else if (text) {
      out.push({ text, kind });
    }
    at = to;
  };

  highlightTree(tsx.parse(code), highlighter, (from, to, classes) => {
    push(from, 'plain');
    push(to, kindOf(classes));
  });
  push(code.length, 'plain');
  return out;
}

/** The tokens regrouped per line, so a line number can sit beside each one
 * without the colouring having to survive a wrapping layout. */
function lines(code: string): Token[][] {
  const out: Token[][] = [[]];
  for (const token of tokenize(code)) {
    const parts = token.text.split('\n');
    parts.forEach((part, at) => {
      if (at > 0) {
        out.push([]);
      }
      if (part) {
        out.at(-1)?.push({ text: part, kind: token.kind });
      }
    });
  }
  return out;
}

export type { Token, TokenKind };
export { lines, tokenize };
