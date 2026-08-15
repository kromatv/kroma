// A story's document, read at full measure.
//
// The inspector's column is a caption's width; a document written to
// `MEASURE.prose` wants the canvas. This is `PageView`'s reading column for a
// story: the same centred cap, the same outline rail on a desk - plus the story
// scope, so the `<Scene>` specimens in the prose draw with the live args.

import { Box, styles, Text } from '@kroma/ui/kit';
import { space } from '@kroma/ui/tokens';
import { memo, useCallback, useMemo, useState } from 'react';
import { type NativeScrollEvent, type NativeSyntheticEvent, ScrollView } from 'react-native';
import type { WorkbenchLayout } from './layout';
import { MdxDoc, MEASURE } from './mdx';
import { OutlineContext, type Section, sectionAtScroll, useOutline } from './outline';
import { outlineOf, PageToc, TOC_WIDTH } from './page-toc';
import type { DocComponent, Story } from './story';
import { StoryDocContext } from './story-blocks';

const JUMP_PAD = space[6];
const SCROLL_HZ = 48;

interface StoryDocsProps {
  story: Story;
  /** The live args, so a scene in the prose is the scene on the canvas. */
  args: Record<string, unknown>;
  content: DocComponent;
  layout: WorkbenchLayout;
}

/** The reading view of a story written as a document. Scrolls itself, so it is
 * given a region to fill rather than a height. */
function StoryDocs({ story, args, content, layout }: Readonly<StoryDocsProps>) {
  const outline = useOutline(story.id);
  const [active, setActive] = useState<string | undefined>(undefined);
  const [scroller, setScroller] = useState<ScrollView | null>(null);

  const listed = outlineOf(outline.sections);
  const top = outline.top;

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const at = sectionAtScroll(listed, top, event.nativeEvent);
      setActive((prev) => (prev === at ? prev : at));
    },
    [listed, top],
  );

  const jump = useCallback(
    (at: Section) => {
      setActive(at.id);
      scroller?.scrollTo({ y: Math.max(0, top + at.y - JUMP_PAD), animated: true });
    },
    [scroller, top],
  );

  // The column is held open whether or not this story fills it, so moving
  // between two documents does not move the text - and neither does the
  // outline arriving, one layout pass after the view opens.
  //
  // One section is enough to list, unlike a guide's three: a component's
  // document is short, and its two or three sections ARE the anatomy a reader
  // came to jump between.
  const rail = layout.mode === 'wide';

  return (
    <OutlineContext.Provider value={outline.sink}>
      <Box flex row minW={0} minH={0}>
        <ScrollView
          key={story.id}
          ref={setScroller}
          onScroll={onScroll}
          scrollEventThrottle={SCROLL_HZ}
          style={s.scroll}
          contentContainerStyle={s.body}
        >
          <Document story={story} args={args} content={content} layout={layout} />
        </ScrollView>
        {rail && listed.length > 0 ? (
          <PageToc sections={listed} active={active} onJump={jump} />
        ) : null}
        {rail && listed.length === 0 ? <Box w={TOC_WIDTH} shrink={0} /> : null}
      </Box>
    </OutlineContext.Provider>
  );
}

const Document = memo(function Document({
  story,
  args,
  content,
  layout,
}: Readonly<StoryDocsProps>) {
  const compact = layout.mode === 'compact';
  const scope = useMemo(() => ({ args, render: story.render }), [args, story.render]);
  return (
    <Box
      w="100%"
      maxW={MEASURE.figure}
      px={layout.gutter}
      pt={compact ? space[4] : space[6]}
      pb={space[16]}
      gap={compact ? space[5] : space[8]}
    >
      <DocHeading story={story} compact={compact} />
      <StoryDocContext.Provider value={scope}>
        <MdxDoc content={content} />
      </StoryDocContext.Provider>
    </Box>
  );
});

// The document's own title, the way a guide has one: the section it is filed
// under, the component's name, and a rule that makes the three one block rather
// than the first two lines of the prose. It scrolls with the article, unlike the
// heading over the tabs, which names the story on every view of it.
function DocHeading({ story, compact }: Readonly<{ story: Story; compact: boolean }>) {
  return (
    <Box
      gap={compact ? space[1] : space[2]}
      pb={compact ? space[4] : space[6]}
      maxW={MEASURE.prose}
      style={s.header}
    >
      <Text variant="overline" color="accent">
        {story.group}
      </Text>
      <Text variant={compact ? 'h2' : 'heading'}>{story.name}</Text>
    </Box>
  );
}

const s = styles({
  scroll: { flex: true },
  // Centred by the scroller rather than by a margin: a margin would leave the
  // scroll bar hugging the text instead of the region.
  body: { align: 'center', grow: 1 },
  header: { borderBottomWidth: 1, borderBottomColor: 'border' },
});

export { StoryDocs };
