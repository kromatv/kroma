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

import { Box, Table } from '@kroma/ui/kit';
import {
  Aside,
  BulletList,
  Cell,
  DocTable,
  HeadCell,
  heading,
  ListItem,
  OrderedList,
  Paragraph,
  Pre,
  Quote,
  Rule,
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
import { Do, Dont, Guidance, Scene } from './story-blocks';

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
  table: DocTable,
  tbody: Table.Body,
  td: Cell,
  th: HeadCell,
  thead: Table.Header,
  tr: Table.Row,
  ul: BulletList,
};

/** The element map plus the blocks only a story's document writes: `<Scene>`,
 * `<Do>` and `<Dont>` resolve from here, so a `.story.mdx` imports nothing to
 * use them. `Guidance` is the compiler's, pairing the two cards. */
const STORY_COMPONENTS = { ...MDX_COMPONENTS, Do, Dont, Guidance, Scene };

/** A story's document, rendered. */
function MdxDoc({ content: Content }: Readonly<{ content: DocComponent }>) {
  const onLayout = useDocumentTop();
  return (
    <Box onLayout={onLayout}>
      <Content components={STORY_COMPONENTS} />
    </Box>
  );
}

export { MEASURE } from './mdx-blocks';
export { MDX_COMPONENTS, MdxDoc, STORY_COMPONENTS };
