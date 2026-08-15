// One page, rendered as an article.
//
// The canvas is as wide as the window and prose is not: a line of text past
// about ninety characters is measurably harder to come back to at the start of
// the next one. So the column is capped and centred by default.
//
// A page whose subject is a figure rather than a paragraph says so with
// `export const width`, because the rule that protects a line of text is the
// wrong rule for a browsable grid: capping THAT wastes the window it needs. What
// the declaration widens is the CANVAS, not the prose - the cap that keeps a
// line readable lives on the elements themselves (see `MEASURE` in
// `mdx-blocks.tsx`), so a wide page spends its width on what asked for it.

import { Box, styles, Text } from '@kroma/ui/kit';
import { space } from '@kroma/ui/tokens';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { type NativeScrollEvent, type NativeSyntheticEvent, ScrollView } from 'react-native';
import type { WorkbenchLayout } from './layout';
import { MdxDoc, MEASURE } from './mdx';
import { OutlineContext, type Section, sectionAtScroll, useOutline } from './outline';
import type { Page, PageWidth } from './page';
import { hasOutline, outlineOf, PageToc, type PageTocProps, TOC_WIDTH } from './page-toc';

interface PageViewProps {
  page: Page;
  layout: WorkbenchLayout;
  /** The section named in the address, scrolled to once the document has
   *  measured itself. */
  section?: string;
  onSection?: (id: string) => void;
}

// `full` is a number rather than `'100%'` so the column still has a maximum on
// a television, where the canvas can be enormous.
const WIDTH: Record<PageWidth, number> = {
  reading: MEASURE.prose,
  wide: MEASURE.figure,
  full: 2200,
};

// Where a jumped-to heading lands: under the top edge rather than against it.
const JUMP_PAD = space[6];

// Often enough to keep the list honest, rarely enough that it is not a render
// per frame.
const SCROLL_HZ = 48;

// A scroller reports fractional offsets, and a rubber-banded one overshoots, so
// the end of the document is a band rather than an equality.

// Where a section sits right now, as one string: the same section measured
// somewhere else is somewhere else to arrive at.
function landing(page: string, at: Section, top: number): string {
  return `${page}#${at.id}@${Math.round(top + at.y)}`;
}

/** A whole `.page.mdx`, with its own heading. Scrolls itself, so it is given a
 * region to fill rather than a height. */
function PageView({ page, layout, section, onSection }: Readonly<PageViewProps>) {
  const outline = useOutline(page.id);
  const scroller = useRef<ScrollView>(null);
  const [active, setActive] = useState<string | undefined>(undefined);
  // What the address has already been honoured for, so a reader who scrolls
  // away is not dragged back by a re-render.
  const arrived = useRef<string | undefined>(undefined);

  const listed = outlineOf(outline.sections);
  const top = outline.top;

  const scrollTo = useCallback(
    (at: Section, animated: boolean) => {
      scroller.current?.scrollTo({ y: Math.max(0, top + at.y - JUMP_PAD), animated });
    },
    [top],
  );

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const at = sectionAtScroll(listed, top, event.nativeEvent);
      setActive((prev) => (prev === at ? prev : at));
    },
    [listed, top],
  );

  const jump = useCallback(
    (at: Section) => {
      arrived.current = landing(page.id, at, top);
      setActive(at.id);
      scrollTo(at, true);
      onSection?.(at.id);
    },
    [page.id, scrollTo, onSection, top],
  );

  // A section named in the address is reached once the document has said where
  // it is - which is a layout pass later than the render that opened the page.
  // Where it is keeps moving for a few of those passes (a fenced sample is
  // measured once it is highlighted, a figure once its font has arrived), so
  // the arrival is honoured again whenever the target LANDS somewhere new -
  // and never twice for the same place, which is what stops a reader who
  // scrolled away from being dragged back.
  const target = section ? outline.sections.find((at) => at.id === section) : undefined;
  useEffect(() => {
    if (!target) return;
    const mark = landing(page.id, target, top);
    if (arrived.current === mark) return;
    arrived.current = mark;
    setActive(target.id);
    scrollTo(target, false);
  }, [target, page.id, scrollTo, top]);

  // The list needs a column of its own, which only a desk has room for beside a
  // measured article. The column is held open whether or not this page fills
  // it: every article is then centred over the same axis, so moving between two
  // guides does not move the text - and neither does the outline arriving, one
  // layout pass after the document opens.
  const rail = layout.mode === 'wide';

  return (
    <OutlineContext.Provider value={outline.sink}>
      <Box flex row minW={0}>
        <ScrollView
          // The article remounts with the page, so nothing it measured about the
          // last one can outlive it.
          key={page.id}
          ref={scroller}
          onScroll={onScroll}
          scrollEventThrottle={SCROLL_HZ}
          style={s.scroll}
          contentContainerStyle={s.body}
        >
          <Article page={page} layout={layout} />
        </ScrollView>
        {rail ? <Rail sections={listed} active={active} onJump={jump} /> : null}
      </Box>
    </OutlineContext.Provider>
  );
}

function Rail({ sections, active, onJump }: Readonly<PageTocProps>) {
  if (!hasOutline(sections)) return <Box w={TOC_WIDTH} shrink={0} />;
  return <PageToc sections={sections} active={active} onJump={onJump} />;
}

interface ArticleProps {
  page: Page;
  layout: WorkbenchLayout;
}

// Memoised because the shell re-renders on every section the reader crosses, and
// the document under it has not changed.
const Article = memo(function Article({ page, layout }: Readonly<ArticleProps>) {
  const compact = layout.mode === 'compact';
  return (
    <Box
      w="100%"
      maxW={WIDTH[page.width ?? 'reading']}
      px={layout.gutter}
      pt={compact ? space[5] : space[10]}
      pb={space[16]}
      gap={compact ? space[5] : space[8]}
    >
      <PageHeader page={page} compact={compact} />
      <MdxDoc content={page.content} />
    </Box>
  );
});

// The overline, the title and the one line under them, ruled off from the body:
// the rule is what makes the three of them one block rather than the first three
// paragraphs of the article.
function PageHeader({ page, compact }: Readonly<{ page: Page; compact: boolean }>) {
  return (
    <Box
      gap={compact ? space[1] : space[2]}
      pb={compact ? space[4] : space[6]}
      maxW={MEASURE.prose}
      style={s.header}
    >
      <Text variant="overline" color="accent">
        {page.group}
      </Text>
      <Text variant={compact ? 'h2' : 'heading'}>{page.title}</Text>
      {page.summary ? (
        <Text variant="body" color="textDim">
          {page.summary}
        </Text>
      ) : null}
    </Box>
  );
}

const s = styles({
  scroll: { flex: true },
  // The column is centred by the scroller rather than by a margin: a margin
  // would leave the scroll bar hugging the text instead of the region.
  body: { align: 'center', grow: 1 },
  header: { borderBottomWidth: 1, borderBottomColor: 'border' },
});

export { PageView };
