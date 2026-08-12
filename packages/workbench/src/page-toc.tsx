// The sections of a guide, listed beside it.
//
// It sits OUTSIDE the article's scroller, which is what keeps it in place while
// the page moves under it - there is no `position: sticky` on a television, and
// nothing here needs one. Every entry is a `Focusable`, so the list is walked
// with a D-pad exactly as the component tree is.

import { Box, Focusable, styles, sv, Text } from '@kroma/ui/kit';
import { space } from '@kroma/ui/tokens';
import { ScrollView } from 'react-native';
import type { Section } from './outline';

interface PageTocProps {
  sections: readonly Section[];
  /** The section the reader is inside; nothing while the article is still on
   *  its opening lines. */
  active?: string;
  onJump: (section: Section) => void;
}

// Two headings are a document, not a structure: listing them says nothing the
// page does not already show at a glance.
const LEAST_SECTIONS = 3;

// Past h3 a heading names a paragraph's subject rather than a section of the
// page, and an outline that deep stops being a map.
const DEEPEST = 3;

/** The headings worth listing, in reading order. */
function outlineOf(sections: readonly Section[]): readonly Section[] {
  return sections.filter((section) => section.level <= DEEPEST);
}

/** Whether an article has enough structure to be worth a list of its own. */
function hasOutline(sections: readonly Section[]): boolean {
  return outlineOf(sections).length >= LEAST_SECTIONS;
}

function PageToc({ sections, active, onJump }: Readonly<PageTocProps>) {
  return (
    // The rule is what makes the list an aside rather than a second column of
    // the article: the article is centred in what is left of the window, so
    // without one the gap between the two reads as an accident.
    <Box w={TOC_WIDTH} shrink={0} pt={space[10]} pl={GUTTER} pr={space[4]} style={s.aside}>
      <Text variant="overline" color="textDim" style={s.title}>
        On this page
      </Text>
      {/* The rail is the entries' own left borders, which is what makes it
          continuous: the active one lights its own segment of it rather than
          sitting beside a second line. */}
      <ScrollView style={s.scroll} contentContainerStyle={s.list}>
        {sections.map((section) => (
          <Entry
            key={section.id}
            section={section}
            active={section.id === active}
            onPress={() => onJump(section)}
          />
        ))}
      </ScrollView>
    </Box>
  );
}

function Entry({
  section,
  active,
  onPress,
}: Readonly<{ section: Section; active: boolean; onPress: () => void }>) {
  return (
    <Focusable
      label={section.label}
      ring={false}
      focusScale={1}
      onPress={onPress}
      sv={tocEntry}
      vars={{ active, deep: section.level >= DEEPEST }}
    >
      {({ slots }) => (
        <Text variant="meta" style={slots.label} lines={2}>
          {section.label}
        </Text>
      )}
    </Focusable>
  );
}

// Wide enough for a heading of a few words on two lines, and narrow enough that
// the article keeps the measure beside it.
const TOC_WIDTH = 252;

// The space between the rule and the rail, which the title shares.
const GUTTER = space[6];

// The rail's own width, so the title's words line up with the entries' rather
// than with their borders.
const RAIL = 2;

const s = styles({
  aside: { borderLeftWidth: 1, borderLeftColor: 'border' },
  title: { paddingLeft: RAIL + space[3], paddingBottom: space[3] },
  scroll: { grow: 0, shrink: 1 },
  list: { pb: space[6] },
});

const tocEntry = sv({
  slots: {
    root: {
      py: space[2],
      pl: space[3],
      pr: space[2],
      borderLeftWidth: RAIL,
      borderLeftColor: 'border',
      radius: 'xs',
      // Square where it meets the rail: a rounded corner there would break the
      // line the entries draw together.
      borderTopLeftRadius: 0,
      borderBottomLeftRadius: 0,
      _hover: { bg: 'tint/5' },
      _focus: { bg: 'tint/8' },
    },
    label: { color: 'textMuted', fontWeight: '600', fontSize: 12.5, lineHeight: 17 },
  },
  variants: {
    // A third-level heading is a step inside the section above it, so it steps
    // in and drops a size rather than getting a rail of its own.
    deep: {
      true: {
        root: { pl: space[3] + space[3], py: space[1] + 2 },
        label: { color: 'textDim', fontWeight: '500', fontSize: 12 },
      },
    },
    // No weight change: the row is already lit by its own segment of the rail
    // and by the wash, and a heavier label re-wraps a two-line heading under
    // the reader as they scroll into it.
    active: {
      true: {
        root: { borderLeftColor: 'accent', bg: 'accentSoft' },
        label: { color: 'accentText' },
      },
    },
  },
  defaults: { active: false, deep: false },
});

export type { PageTocProps };
export { hasOutline, LEAST_SECTIONS, outlineOf, PageToc, TOC_WIDTH };
