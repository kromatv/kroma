// The block half of the element map: the paragraphs, headings, lists, tables
// and rules a document is built out of, and the rhythm between them. The inline
// half - the marks, and the rule that decides what a line is - lives in
// `mdx-marks.tsx`, and `mdx.tsx` is the map that names both.

import { Box, CheckboxFace, Divider, styles, Text, type TextProps } from '@kroma/ui/kit';
import { space } from '@kroma/ui/tokens';
import { Children, isValidElement, type ReactNode, useContext } from 'react';
import { CodeBlock } from './code';
import { BODY, MarkerContext, Prose, runs, TaskBox } from './mdx-marks';
import { useSection } from './outline';
import { SectionAnchor } from './section-anchor';

/**
 * The two widths a document is written across.
 *
 * `prose` is where ninety characters land at the body role's size, which is
 * where the eye starts losing the start of the next line. It is a CAP and never
 * a width, so a narrower document - a story's prose in the inspector - never
 * notices it. A figure is not read a line at a time and takes more room; past
 * `figure` it stops being a figure and becomes a banner.
 */
const MEASURE = { prose: 760, figure: 1100 } as const;

// The vertical rhythm, phone first. One rule runs through it: the space ABOVE a
// heading is several times the space below it, so a heading binds to the text it
// introduces rather than floating between two blocks.
const BLOCK = { base: space[3], md: space[4] };
const FIGURE_ABOVE = { base: space[1], md: space[2] };
const FIGURE_BELOW = { base: space[4], md: space[6] };
const SECTION_ABOVE = { base: space[6], md: space[10] };

// Half the difference between the body role's line and the 20pt checkbox face,
// which lands the box on the optical centre of the first line rather than on
// its top edge.
const TASK_LIFT = 2;

const s = styles({
  block: { maxW: MEASURE.prose, mb: BLOCK },
  // A section opens on a rule the width of the column it heads, with the
  // heading hung under it.
  h1: { maxW: MEASURE.prose, mt: SECTION_ABOVE, mb: { base: space[2], md: space[3] } },
  h2: {
    maxW: MEASURE.prose,
    mt: SECTION_ABOVE,
    pt: { base: space[3], md: space[4] },
    mb: { base: space[2], md: space[3] },
    borderTopWidth: 1,
    borderTopColor: 'border',
  },
  h3: {
    maxW: MEASURE.prose,
    mt: { base: space[4], md: space[6] },
    mb: { base: space[1], md: space[2] },
  },
  h4: {
    maxW: MEASURE.prose,
    mt: { base: space[3], md: space[5] },
    mb: { base: space[1], md: space[2] },
  },
  list: { maxW: MEASURE.prose, mb: BLOCK, gap: space[2] },
  bullet: { w: 3, h: 3, mt: 10 },
  marker: { minW: 18, mt: 1 },
  task: { mt: TASK_LIFT },
  quote: {
    maxW: MEASURE.prose,
    mb: BLOCK,
    gap: space[3],
    py: space[2],
    pr: space[3],
    bg: 'surface1',
    radius: 'sm',
  },
  quoteRule: { w: 2, radius: 'pill' },
  figure: { maxW: MEASURE.figure, mt: FIGURE_ABOVE, mb: FIGURE_BELOW },
  table: { border: 'border', radius: 'md', bg: 'surface1', overflow: 'hidden' },
  row: { borderBottomWidth: 1, borderBottomColor: 'border' },
  cell: { px: space[3], py: space[2] },
  rule: { maxW: MEASURE.prose, my: { base: space[4], md: space[8] } },
  footnotes: {
    maxW: MEASURE.prose,
    mt: SECTION_ABOVE,
    pt: space[4],
    opacity: 0.8,
    borderTopWidth: 1,
    borderTopColor: 'border',
  },
});

/**
 * The figure block: the one measure and the one rhythm every part of a document
 * that is not a line of prose sits in - a table, a fenced sample, and anything a
 * page embeds of its own.
 *
 * Exported because a `.page.mdx` embeds components this map never sees, and a
 * page that spaces one by hand is a page with a rhythm of its own.
 */
function DocFigure({ children }: Readonly<{ children?: ReactNode }>) {
  return <Box style={s.figure}>{children}</Box>;
}

function Paragraph({ children }: Readonly<{ children?: ReactNode }>) {
  return (
    <Prose variant={BODY.variant} color={BODY.color} style={s.block}>
      {children}
    </Prose>
  );
}

// Sizes rather than weights carry the levels apart: the display face is what a
// heading is set in and it is bold at every step, so a second bold step would
// have said nothing. Read at render, not captured here, so a theme swap reaches
// them.
function frameFor(level: number) {
  if (level <= 1) return s.h1;
  if (level === 2) return s.h2;
  return level === 3 ? s.h3 : s.h4;
}

// A heading reports itself to the article's outline as it lays out, which is
// what the table of contents beside a guide page is built from.
function heading(level: number, variant: TextProps['variant'], color: TextProps['color']) {
  return function Heading({ children }: Readonly<{ children?: ReactNode }>) {
    const { id, onLayout } = useSection(level, children);
    return (
      <Box row wrap align="center" gapX={space[2]} style={frameFor(level)} onLayout={onLayout}>
        <Box shrink={1}>
          <Prose variant={variant} color={color}>
            {children}
          </Prose>
        </Box>
        {id ? <SectionAnchor id={id} /> : null}
      </Box>
    );
  };
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

// A GFM task item arrives as a checkbox followed by its text. The box IS the
// item's marker, so the item draws its own in the marker column and drops the
// one it was handed: left in the run it draws under a bullet the item does not
// want, and inside the <Text> that gathers a run it sits off the baseline.
function splitTask(children: ReactNode): { checked: boolean | null; rest: ReactNode[] } {
  const all = Children.toArray(children);
  const at = all.findIndex((child) => isValidElement(child) && child.type === TaskBox);
  const box = all[at];
  if (!isValidElement<{ checked?: boolean }>(box)) return { checked: null, rest: all };
  return {
    checked: Boolean(box.props.checked),
    rest: [...all.slice(0, at), ...all.slice(at + 1)],
  };
}

function Marker({ checked }: Readonly<{ checked: boolean | null }>) {
  const marker = useContext(MarkerContext);
  if (checked !== null) {
    return (
      <Box shrink={0} style={s.task}>
        <CheckboxFace checked={checked} />
      </Box>
    );
  }
  if (marker === null) return <Box shrink={0} radius="pill" bg="textDim" style={s.bullet} />;
  return (
    <Text variant="body" color="textDim" style={s.marker}>
      {`${marker}.`}
    </Text>
  );
}

function ListItem({ children }: Readonly<{ children?: ReactNode }>) {
  const task = splitTask(children);
  return (
    <Box row gap={space[3]} align="flex-start">
      <Marker checked={task.checked} />
      <Box flex>{runs(task.rest)}</Box>
    </Box>
  );
}

function Quote({ children }: Readonly<{ children?: ReactNode }>) {
  return (
    <Box row style={s.quote}>
      <Box bg="accent" style={s.quoteRule} />
      <Box flex>{runs(children)}</Box>
    </Box>
  );
}

function Rule() {
  return (
    <Box style={s.rule}>
      <Divider />
    </Box>
  );
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
    <DocFigure>
      <CodeBlock code={codeOf(children)} />
    </DocFigure>
  );
}

function Table({ children }: Readonly<{ children?: ReactNode }>) {
  return (
    <DocFigure>
      <Box style={s.table}>{children}</Box>
    </DocFigure>
  );
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
      <Prose variant="label" color="text">
        {children}
      </Prose>
    </Box>
  );
}

// GFM puts the footnote list in a <section>.
function Aside({ children }: Readonly<{ children?: ReactNode }>) {
  return <Box style={s.footnotes}>{children}</Box>;
}

export {
  Aside,
  BulletList,
  Cell,
  DocFigure,
  Group,
  HeadCell,
  heading,
  ListItem,
  MEASURE,
  OrderedList,
  Paragraph,
  Pre,
  Quote,
  Row,
  Rule,
  Table,
};
