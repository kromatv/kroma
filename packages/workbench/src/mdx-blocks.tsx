// The block half of the element map: the paragraphs, headings, lists, tables
// and rules a document is built out of, and the rhythm between them. The blocks
// themselves are the kit's - <List>, <Table>, <CodeBlock> - and what lives here
// is what a DOCUMENT adds to them: the measure it is read at and the space
// between one block and the next. The inline half - the marks, and the rule that
// decides what a line is - lives in `mdx-marks.tsx`, and `mdx.tsx` is the map
// that names both.

import { Box, CodeBlock, Divider, List, styles, Table, type TextProps } from '@kroma/ui/kit';
import { space } from '@kroma/ui/tokens';
import { Children, isValidElement, type ReactNode } from 'react';
import { BODY, Prose, runs, TaskBox } from './mdx-marks';
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
  list: { maxW: MEASURE.prose, mb: BLOCK },
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
  return (
    <Box style={s.list}>
      <List.Root>{children}</List.Root>
    </Box>
  );
}

function OrderedList({ children }: Readonly<{ children?: ReactNode }>) {
  return (
    <Box style={s.list}>
      <List.Root ordered>{children}</List.Root>
    </Box>
  );
}

// A GFM task item arrives as a checkbox followed by its text. The box IS the
// item's marker, so the item hands the state to <List.Item> and drops the box it
// was given: left in the run it draws under a bullet the item does not want, and
// inside the <Text> that gathers a run it sits off the baseline.
function splitTask(children: ReactNode): { checked?: boolean; rest: ReactNode[] } {
  const all = Children.toArray(children);
  const at = all.findIndex((child) => isValidElement(child) && child.type === TaskBox);
  const box = all[at];
  if (!isValidElement<{ checked?: boolean }>(box)) return { rest: all };
  return {
    checked: Boolean(box.props.checked),
    rest: [...all.slice(0, at), ...all.slice(at + 1)],
  };
}

function ListItem({ children }: Readonly<{ children?: ReactNode }>) {
  const task = splitTask(children);
  return <List.Item checked={task.checked}>{runs(task.rest)}</List.Item>;
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

function DocTable({ children }: Readonly<{ children?: ReactNode }>) {
  return (
    <DocFigure>
      <Table.Root>{children}</Table.Root>
    </DocFigure>
  );
}

// A cell's text is a run of marks rather than a string, so the ink is set here
// rather than left to the kit's own plain-string case.
function Cell({ children }: Readonly<{ children?: ReactNode }>) {
  return <Table.Cell>{runs(children)}</Table.Cell>;
}

function HeadCell({ children }: Readonly<{ children?: ReactNode }>) {
  return (
    <Table.Cell>
      <Prose variant="label" color="text">
        {children}
      </Prose>
    </Table.Cell>
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
  DocTable,
  HeadCell,
  heading,
  ListItem,
  MEASURE,
  OrderedList,
  Paragraph,
  Pre,
  Quote,
  Rule,
};
