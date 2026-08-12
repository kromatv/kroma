// The element map: what MDX's HTML element names render as in the kit.
//
// MDX compiles markdown to `<p>`, `<ul>`, `<code>`... and React Native has NONE
// of those. Every element MDX can emit therefore needs a component here, or a
// television crashes at render time on an element a browser would have shrugged
// off - which is why `mdx.test.tsx` derives the list from a real compile rather
// than trusting this file to be complete.
//
// The same map serves the inline `docs:` strings (see `docs.tsx`), so there is
// one set of components behind both spellings of a story's prose. The components
// themselves are split by what they are: blocks and the rhythm between them in
// `mdx-blocks.tsx`, marks and the rule that decides what a line is in
// `mdx-marks.tsx`.

import { Box } from '@kroma/ui/kit';
import {
  Aside,
  BulletList,
  Cell,
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
} from './mdx-blocks';
import {
  Anchor,
  Emphasis,
  InlineCode,
  LineBreak,
  Picture,
  Strike,
  Strong,
  Superscript,
  TaskBox,
} from './mdx-marks';
import { useDocumentTop } from './outline';
import type { DocComponent } from './story';

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
  h1: heading(1, 'subheading', 'text'),
  h2: heading(2, 'h2', 'text'),
  h3: heading(3, 'cardTitle', 'text'),
  h4: heading(4, 'cardTitle', 'text'),
  h5: heading(5, 'cardTitle', 'textMuted'),
  h6: heading(6, 'cardTitle', 'textMuted'),
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
  const onLayout = useDocumentTop();
  return (
    <Box onLayout={onLayout}>
      <Content components={MDX_COMPONENTS} />
    </Box>
  );
}

export { MDX_COMPONENTS, MdxDoc, MEASURE };
