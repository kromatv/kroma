// The element map: what MDX's HTML element names render as in the kit.
//
// MDX compiles markdown to `<p>`, `<ul>`, `<code>`... and React Native has NONE
// of those. Every element MDX can emit therefore needs a component here, or a
// television crashes at render time on an element a browser would have shrugged
// off - which is why `mdx.test.tsx` derives the list from a real compile rather
// than trusting this file to be complete.
//
// The same map serves the inline `docs:` strings (see `docs.tsx`), so there is
// one set of components behind both spellings of a story's prose.

import { Box, Divider, Img, styles, Text, type TextProps } from '@kroma/ui/kit';
import {
  Children,
  createContext,
  isValidElement,
  type ReactNode,
  useContext,
  useMemo,
} from 'react';
import { Linking } from 'react-native';
import { CodeBlock, MONO } from './code';
import type { DocComponent } from './story';

const BLOCK_GAP = 12;

const s = styles({
  block: { mb: BLOCK_GAP },
  h1: { mt: 4, mb: 2 },
  h2: { mt: 8, mb: 2, fontWeight: '700' },
  h3: { mt: 8, mb: 2, fontWeight: '700', letterSpacing: 0.2 },
  bold: { fontWeight: '700' },
  em: { fontStyle: 'italic' },
  del: { textDecorationLine: 'line-through' },
  sup: { fontSize: 9 },
  link: { textDecorationLine: 'underline' },
  code: { fontFamily: MONO, fontSize: 13, bg: 'white/6' },
  list: { mb: BLOCK_GAP, gap: 7 },
  bullet: { w: 3, h: 3, mt: 7 },
  marker: { fontFamily: MONO, fontSize: 11, minW: 14, mt: 1 },
  quote: { mb: BLOCK_GAP, gap: 10 },
  quoteRule: { w: 2, radius: 'pill' },
  table: { mb: BLOCK_GAP, border: 'border', radius: 'sm', overflow: 'hidden' },
  row: { borderBottomWidth: 1, borderBottomColor: 'border' },
  cell: { px: 10, py: 7 },
  image: { h: 140, mb: BLOCK_GAP },
  footnotes: { mt: 8, opacity: 0.8 },
});

interface Ink {
  variant: TextProps['variant'];
  color: TextProps['color'];
}

// The type role and colour the surrounding block is set in. React Native's
// <Text> inherits from its parent, but the kit's <Text> defaults both props
// rather than leaving them unset, so a nested mark has to be TOLD what it sits
// in - the same thing the old two-mark renderer did by passing them down.
const InkContext = createContext<Ink>({ variant: 'meta', color: 'textMuted' });

// Which item of an ordered list is being drawn; null inside a bullet list.
const MarkerContext = createContext<number | null>(null);

interface ProseProps extends Ink {
  style?: TextProps['style'];
  children?: ReactNode;
}

/** A run of prose, publishing its own ink to the marks inside it. */
function Prose({ variant, color, style, children }: Readonly<ProseProps>) {
  const ink = useMemo(() => ({ variant, color }), [variant, color]);
  return (
    <InkContext.Provider value={ink}>
      <Text variant={variant} color={color} style={style}>
        {children}
      </Text>
    </InkContext.Provider>
  );
}

interface MarkProps {
  style?: TextProps['style'];
  color?: TextProps['color'];
  onPress?: () => void;
  children?: ReactNode;
}

/** One inline mark, in the ink of the block it sits in. */
function Mark({ style, color, onPress, children }: Readonly<MarkProps>) {
  const ink = useContext(InkContext);
  return (
    <Text variant={ink.variant} color={color ?? ink.color} style={style} onPress={onPress}>
      {children}
    </Text>
  );
}

function block(
  variant: TextProps['variant'],
  color: TextProps['color'],
  style: TextProps['style'],
) {
  return function Block({ children }: Readonly<{ children?: ReactNode }>) {
    return (
      <Prose variant={variant} color={color} style={style}>
        {children}
      </Prose>
    );
  };
}

function Paragraph({ children }: Readonly<{ children?: ReactNode }>) {
  return (
    <Prose variant="meta" color="textMuted" style={s.block}>
      {children}
    </Prose>
  );
}

function Strong({ children }: Readonly<{ children?: ReactNode }>) {
  return <Mark style={s.bold}>{children}</Mark>;
}

function Emphasis({ children }: Readonly<{ children?: ReactNode }>) {
  return <Mark style={s.em}>{children}</Mark>;
}

function Strike({ children }: Readonly<{ children?: ReactNode }>) {
  return <Mark style={s.del}>{children}</Mark>;
}

function Superscript({ children }: Readonly<{ children?: ReactNode }>) {
  return <Mark style={s.sup}>{children}</Mark>;
}

function InlineCode({ children }: Readonly<{ children?: ReactNode }>) {
  return (
    <Mark style={s.code} color="accent">
      {children}
    </Mark>
  );
}

// A doc's link is prose, and `openURL` will hand any scheme it is given to the
// platform: `javascript:` runs on a webview, `file:` reads the disk. The two a
// component's documentation ever needs are the two allowed.
const WEB_LINK = /^https?:\/\//i;

function openLink(href: string): void {
  if (!WEB_LINK.test(href)) return;
  Linking.openURL(href).catch(() => undefined);
}

function Anchor({ href, children }: Readonly<{ href?: string; children?: ReactNode }>) {
  return (
    <Mark style={s.link} color="accent" onPress={href ? () => openLink(href) : undefined}>
      {children}
    </Mark>
  );
}

function LineBreak() {
  return <Mark>{'\n'}</Mark>;
}

// A GFM task box. Two characters rather than a real control: it is a rendering
// of a document, not a control anyone can tick.
function TaskBox({ checked }: Readonly<{ checked?: boolean }>) {
  return <Mark color={checked ? 'success' : 'textDim'}>{checked ? '[x]' : '[ ]'}</Mark>;
}

function Picture({ src, alt }: Readonly<{ src?: string; alt?: string }>) {
  return (
    <Box style={s.image}>
      <Img src={src ?? null} alt={alt} fit="contain" radius="sm" />
    </Box>
  );
}

const INLINE = new Set<unknown>([
  Anchor,
  Emphasis,
  InlineCode,
  LineBreak,
  Picture,
  Strike,
  Strong,
  Superscript,
  TaskBox,
]);

// Consecutive inline children gathered into one <Text>, block children left
// alone. This is what lets a list item hold a bare sentence (a tight list),
// a paragraph (a loose one) or a code block, all on a platform where a stray
// string inside a view is a crash rather than a stray string.
function runs(children: ReactNode): ReactNode[] {
  const out: ReactNode[] = [];
  let run: ReactNode[] = [];
  const flush = () => {
    if (run.length === 0) return;
    out.push(
      <Prose key={`run-${out.length}`} variant="meta" color="textMuted">
        {run}
      </Prose>,
    );
    run = [];
  };
  for (const child of Children.toArray(children)) {
    if (typeof child === 'string' || (isValidElement(child) && INLINE.has(child.type))) {
      run.push(child);
    } else {
      flush();
      out.push(child);
    }
  }
  flush();
  return out;
}

function BulletList({ children }: Readonly<{ children?: ReactNode }>) {
  return <Box style={s.list}>{children}</Box>;
}

function OrderedList({ children }: Readonly<{ children?: ReactNode }>) {
  return (
    <Box style={s.list}>
      {Children.toArray(children).map((item, at) => (
        <MarkerContext.Provider
          // The document order is fixed: the index IS the identity.
          // biome-ignore lint/suspicious/noArrayIndexKey: positional by nature
          key={at}
          value={at + 1}
        >
          {item}
        </MarkerContext.Provider>
      ))}
    </Box>
  );
}

function ListItem({ children }: Readonly<{ children?: ReactNode }>) {
  const marker = useContext(MarkerContext);
  return (
    <Box row gap={9} align="flex-start">
      {marker === null ? (
        <Box shrink={0} radius="pill" bg="textDim" style={s.bullet} />
      ) : (
        <Text variant="meta" color="textDim" style={s.marker}>
          {`${marker}.`}
        </Text>
      )}
      <Box flex>{runs(children)}</Box>
    </Box>
  );
}

function Quote({ children }: Readonly<{ children?: ReactNode }>) {
  return (
    <Box row style={s.quote}>
      <Box bg="accentSoft" style={s.quoteRule} />
      <Box flex>{runs(children)}</Box>
    </Box>
  );
}

function Rule() {
  return <Divider spacing={BLOCK_GAP} />;
}

// MDX emits `<pre><code className="language-tsx">…</code></pre>`, so the code
// and its language are one level down.
function codeOf(children: ReactNode): string {
  const only = Children.toArray(children)[0];
  if (typeof only === 'string') return only;
  if (isValidElement<{ children?: ReactNode }>(only) && typeof only.props.children === 'string') {
    return only.props.children;
  }
  return '';
}

function Pre({ children }: Readonly<{ children?: ReactNode }>) {
  return (
    <Box style={s.block}>
      <CodeBlock code={codeOf(children)} />
    </Box>
  );
}

function Table({ children }: Readonly<{ children?: ReactNode }>) {
  return <Box style={s.table}>{children}</Box>;
}

function Group({ children }: Readonly<{ children?: ReactNode }>) {
  return <Box>{children}</Box>;
}

function Row({ children }: Readonly<{ children?: ReactNode }>) {
  return (
    <Box row style={s.row}>
      {children}
    </Box>
  );
}

function Cell({ children }: Readonly<{ children?: ReactNode }>) {
  return (
    <Box flex style={s.cell}>
      {runs(children)}
    </Box>
  );
}

function HeadCell({ children }: Readonly<{ children?: ReactNode }>) {
  return (
    <Box flex bg="surface2" style={s.cell}>
      <Prose variant="meta" color="text" style={s.bold}>
        {children}
      </Prose>
    </Box>
  );
}

// GFM puts the footnote list in a <section>.
function Aside({ children }: Readonly<{ children?: ReactNode }>) {
  return <Box style={s.footnotes}>{children}</Box>;
}

/** Every element MDX can emit, mapped to the kit. Passed to a compiled
 * `.docs.mdx` as its `components`, and read directly by the renderer for the
 * inline `docs:` strings. */
const MDX_COMPONENTS = {
  a: Anchor,
  blockquote: Quote,
  br: LineBreak,
  code: InlineCode,
  del: Strike,
  em: Emphasis,
  h1: block('title', 'text', s.h1),
  h2: block('label', 'text', s.h2),
  h3: block('meta', 'text', s.h3),
  h4: block('meta', 'text', s.h3),
  h5: block('meta', 'textMuted', s.h3),
  h6: block('meta', 'textMuted', s.h3),
  hr: Rule,
  img: Picture,
  input: TaskBox,
  li: ListItem,
  ol: OrderedList,
  p: Paragraph,
  pre: Pre,
  section: Aside,
  strong: Strong,
  sup: Superscript,
  table: Table,
  tbody: Group,
  td: Cell,
  th: HeadCell,
  thead: Group,
  tr: Row,
  ul: BulletList,
};

/** A story's `.docs.mdx`, rendered. */
function MdxDoc({ content: Content }: Readonly<{ content: DocComponent }>) {
  return (
    <Box>
      <Content components={MDX_COMPONENTS} />
    </Box>
  );
}

export type { Ink };
export { MDX_COMPONENTS, MdxDoc, Prose };
