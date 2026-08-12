// <Timeline>: a sequence of events down a rail - a history, an activity feed,
// the steps a job went through.
//
// The rail is drawn by the entries themselves, each running a line from its own
// node into the next one's, because Yoga has no way to stretch one line behind a
// column of unequal rows. The Root walks its direct children once to tell the
// last entry to stop drawing, which is the only thing an entry cannot know about
// itself.

import { Children, isValidElement, type ReactNode, useMemo } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { Icon, type IconName } from '#ui/components/atoms/icon';
import { Text } from '#ui/components/atoms/text';
import { type ColorValue, styles, sv, type TypeRole } from '#ui/core';
import { type ControlSize, entryDefaultSize } from '#ui/lib/field-shell';
import { partContext } from '#ui/lib/part-context';

/** What an entry is: something that happened (`event`), the state the thing is
 * in right now (`current`), or where the sequence began (`origin`). */
type TimelineTone = 'event' | 'current' | 'origin';

interface Shape {
  title: TypeRole;
  detail: TypeRole;
  /** The rail column's width, which is also the node's box. */
  rail: number;
  dot: number;
  glyph: number;
  /** Between the rail and the entry's own wash. */
  gap: number;
  /** Between one entry and the next. */
  step: number;
}

const SHAPE: Record<ControlSize, Shape> = {
  sm: { title: 'meta', detail: 'meta', rail: 16, dot: 7, glyph: 13, gap: 4, step: 12 },
  md: { title: 'label', detail: 'meta', rail: 20, dot: 9, glyph: 15, gap: 6, step: 16 },
  tv: { title: 'labelTv', detail: 'metaTv', rail: 30, dot: 13, glyph: 22, gap: 10, step: 24 },
};

const INK: Record<TimelineTone, ColorValue> = {
  event: 'textMuted',
  current: 'accent',
  origin: 'textDim',
};

// The entry's own inset, so its hover wash is a block around the words rather
// than a stripe against them.
const WASH = 8;

interface Context {
  shape: Shape;
  last: boolean;
}

const [TimelineContext, useTimeline] = partContext<Context>('Timeline.Root');

interface TimelineRootProps {
  /** How loud the entries read, defaulting to the app's entry size
   *  (`setEntryDefaults`). */
  size?: ControlSize;
  /** The entries, newest first by convention. Only a DIRECT element is counted,
   *  which is what lets the last one stop the rail. */
  children?: ReactNode;
}

function Root({ size, children }: Readonly<TimelineRootProps>) {
  const shape = SHAPE[size ?? entryDefaultSize()];
  const items = Children.toArray(children).filter((child) => isValidElement(child));
  // One value per position rather than one per render: a fresh object in the
  // provider re-renders every entry whenever the rail does.
  const rail = useMemo(
    () => items.map((_, at) => ({ shape, last: at === items.length - 1 })),
    [shape, items.length],
  );
  return (
    <Box>
      {items.map((child, at) => (
        // The position is the identity here: this is the caller's own list of
        // children, in the order it was written, and nothing reorders it.
        // biome-ignore lint/suspicious/noArrayIndexKey: the position IS what the provider carries
        <TimelineContext.Provider key={at} value={rail[at] as Context}>
          {child}
        </TimelineContext.Provider>
      ))}
    </Box>
  );
}

interface TimelineItemProps {
  /** The node's face. Defaults to `event`. */
  tone?: TimelineTone;
  /** A glyph in place of the node's dot. */
  icon?: IconName;
  /** What happened, in one line. Anything longer goes in `children`. */
  title?: ReactNode;
  /** The particulars under it: a short revision, a duration, a code. */
  detail?: ReactNode;
  /** Makes the WHOLE entry the control - one D-pad stop and a pointer-sized hit
   *  area - rather than putting a second control inside it. */
  onPress?: () => void;
  /** Names a pressable entry to assistive tech. Defaults to `title` where that
   *  is plain text. */
  label?: string;
  children?: ReactNode;
}

function Item({
  tone = 'event',
  icon,
  title,
  detail,
  onPress,
  label,
  children,
}: Readonly<TimelineItemProps>) {
  const { shape, last } = useTimeline('Item');
  const body = (
    <>
      {title === undefined ? null : (
        <Text variant={shape.title} lines={2} style={s.title}>
          {title}
        </Text>
      )}
      {detail === undefined ? null : (
        <Text variant={shape.detail} color="textDim">
          {detail}
        </Text>
      )}
      {children}
    </>
  );
  return (
    <Box row pb={last ? 0 : shape.step}>
      <Rail tone={tone} icon={icon} shape={shape} last={last} />
      {/* minW 0: without it a long line widens the entry instead of wrapping
          inside it. */}
      <Box flex minW={0} ml={shape.gap}>
        {onPress ? (
          <Focusable
            label={label ?? (typeof title === 'string' ? title : undefined)}
            ring={false}
            focusScale={1}
            onPress={onPress}
            sv={timelineEntry}
          >
            {body}
          </Focusable>
        ) : (
          <Box gap={2} px={WASH} py={4}>
            {body}
          </Box>
        )}
      </Box>
    </Box>
  );
}

function Rail({
  tone,
  icon,
  shape,
  last,
}: Readonly<{ tone: TimelineTone; icon?: IconName; shape: Shape; last: boolean }>) {
  return (
    <Box w={shape.rail} shrink={0} align="center">
      <Box h={shape.rail} align="center" justify="center">
        {icon ? (
          <Icon name={icon} size={shape.glyph} color={INK[tone]} />
        ) : (
          <Node tone={tone} size={shape.dot} />
        )}
      </Box>
      {last ? null : <Box flex w={1} mt={3} bg="border" />}
    </Box>
  );
}

// The origin is hollow: the sequence STARTS there rather than happening there.
function Node({ tone, size }: Readonly<{ tone: TimelineTone; size: number }>) {
  if (tone === 'origin') {
    return <Box w={size} h={size} radius="pill" borderWidth={1.5} border="textDim" />;
  }
  return <Box w={size} h={size} radius="pill" bg={INK[tone]} />;
}

const s = styles({ title: { fontWeight: '600' } });

const timelineEntry = sv({
  base: {
    gap: 2,
    px: WASH,
    py: 4,
    radius: 'sm',
    _hover: { bg: 'tint/5' },
    _focus: { bg: 'tint/8' },
  },
});

/**
 * A sequence of events down a rail.
 *
 * ```tsx
 * <Timeline.Root>
 *   <Timeline.Item tone="current" title="Uncommitted changes" />
 *   <Timeline.Item
 *     icon="git-commit"
 *     title="fix: the range request is clamped"
 *     detail="9db893fe · yesterday"
 *     onPress={open}
 *   />
 *   <Timeline.Item tone="origin" title="Added 27 Jul 2026" />
 * </Timeline.Root>
 * ```
 */
const Timeline = { Root, Item };

export type { TimelineItemProps, TimelineRootProps, TimelineTone };
export { Timeline };
