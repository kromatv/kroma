// <Callout>: the toned block a screen drops in beside its content to say one
// thing - a failure, a warning, a result worth pointing at.
//
// It is NOT a toast: a toast arrives and leaves, a callout is part of the page
// and stays as long as what it reports is true. It is not an <EmptyState>
// either: that stands in for content that is missing, this sits next to content
// that is there.

import {
  Children,
  createContext,
  isValidElement,
  type ReactNode,
  useContext,
  useMemo,
} from 'react';
import { Box } from '#ui/components/atoms/box';
import { Icon, type IconName } from '#ui/components/atoms/icon';
import { Text } from '#ui/components/atoms/text';
import { type ColorValue, styles, type TypeRole } from '#ui/core';
import {
  CONTROL,
  type ControlMetrics,
  type ControlSize,
  entryDefaultSize,
} from '#ui/lib/field-shell';

type CalloutTone = 'neutral' | 'accent' | 'success' | 'danger';

interface Paint {
  bg: ColorValue;
  border: ColorValue;
  /** The tone's ink, solid at every step: a callout's glyph wears it too, and
   *  the palette never alphas a glyph. */
  ink: ColorValue;
}

const TONE: Record<CalloutTone, Paint> = {
  neutral: { bg: 'tint/6', border: 'border', ink: 'text' },
  accent: { bg: 'accentSoft', border: 'accent/25', ink: 'accentText' },
  success: { bg: 'success/9', border: 'success/25', ink: 'success' },
  danger: { bg: 'danger/10', border: 'danger/25', ink: 'dangerHover' },
};

interface Shape {
  title: TypeRole;
  detail: TypeRole;
  glyph: number;
}

// The well, the corner and the rhythm come off the control shell, because a
// callout sits in forms beside fields and has to read as the same family. What
// is its own is the type: a callout is read, not filled in.
const SHAPE: Record<ControlSize, Shape> = {
  sm: { title: 'meta', detail: 'meta', glyph: 16 },
  md: { title: 'body', detail: 'meta', glyph: 19 },
  tv: { title: 'bodyTv', detail: 'metaTv', glyph: 26 },
};

interface Context {
  shape: Shape;
  paint: Paint;
  metrics: ControlMetrics;
}

const CalloutContext = createContext<Context | null>(null);

function useCallout(part: string): Context {
  const at = useContext(CalloutContext);
  if (!at) throw new Error(`<Callout.${part}> must be used inside <Callout.Root>`);
  return at;
}

interface Sorted {
  leading: ReactNode[];
  message: ReactNode[];
  trailing: ReactNode[];
}

// Yoga has no `order` and there is no `:has()` selector, so the Root sorts its
// direct children into the three slots once - the same shape <ListRow> takes.
function sort(children: ReactNode): Sorted {
  const at: Sorted = { leading: [], message: [], trailing: [] };
  for (const child of Children.toArray(children)) {
    const part = isValidElement(child) ? child.type : null;
    if (part === Media) at.leading.push(child);
    else if (part === Actions) at.trailing.push(child);
    else at.message.push(child);
  }
  return at;
}

// A written part always wins the slot; the sugar only fills one nobody claimed.
function slot(written: readonly ReactNode[], sugar: ReactNode): ReactNode {
  return written.length > 0 ? written : sugar;
}

interface CalloutRootProps {
  /** What the block is saying, in the palette's own words. Defaults to
   *  `neutral`, so a tone is always a decision. */
  tone?: CalloutTone;
  /** The control shell's size, defaulting to the app's (`setEntryDefaults`), so
   *  a callout in a form matches the fields around it without saying so. */
  size?: ControlSize;
  /** The mark, as a glyph the kit can size. Media it cannot size goes through
   *  <Callout.Media>, which wins the head of the row. */
  icon?: IconName;
  /** A DIRECT <Callout.Media> or <Callout.Actions> child is sorted into the head
   *  and tail of the row, so those two may be written anywhere; everything else
   *  is the message column, in the order it was written. */
  children?: ReactNode;
}

function Root({ tone = 'neutral', size, icon, children }: Readonly<CalloutRootProps>) {
  const step = size ?? entryDefaultSize();
  const metrics = CONTROL[step];
  const at = useMemo(() => sort(children), [children]);
  const context = useMemo<Context>(
    () => ({ shape: SHAPE[step], paint: TONE[tone], metrics }),
    [step, tone, metrics],
  );

  const leading = slot(at.leading, icon === undefined ? null : <Media name={icon} />);

  return (
    <CalloutContext.Provider value={context}>
      <Box
        row
        align="center"
        gap={metrics.gap}
        px={metrics.px}
        py={metrics.py}
        radius={metrics.radius}
        bg={context.paint.bg}
        border={context.paint.border}
      >
        {leading}
        {/* minW 0: without it a long message pushes the actions off the block
            instead of wrapping, which is the one thing a message must not do. */}
        <Box flex minW={0} gap={4}>
          {at.message}
        </Box>
        {at.trailing}
      </Box>
    </CalloutContext.Provider>
  );
}

/** The mark that says which kind of thing this is, inked and sized by the Root.
 *  A glyph goes through `name`; media the kit cannot size goes through
 *  `children`. */
function Media({ name, children }: Readonly<{ name?: IconName; children?: ReactNode }>) {
  const { shape, paint } = useCallout('Media');
  return (
    <Box shrink={0}>
      {name ? <Icon name={name} size={shape.glyph} color={paint.ink} /> : children}
    </Box>
  );
}

/** The one sentence the block exists to say, in the tone's ink. */
function Title({ children }: Readonly<{ children: ReactNode }>) {
  const { shape, paint } = useCallout('Title');
  return (
    <Text variant={shape.title} color={paint.ink} style={s.title}>
      {children}
    </Text>
  );
}

/** The technical particular behind it: a path, a status line, what the server
 *  actually answered. Quiet whatever the tone, so the title keeps the colour. */
function Detail({ children }: Readonly<{ children: ReactNode }>) {
  const { shape } = useCallout('Detail');
  return (
    <Text variant={shape.detail} color="textMuted">
      {children}
    </Text>
  );
}

/** The one thing to do about it, pinned to the end of the row. */
function Actions({ children }: Readonly<{ children: ReactNode }>) {
  const { metrics } = useCallout('Actions');
  return (
    <Box row align="center" shrink={0} gap={metrics.gap}>
      {children}
    </Box>
  );
}

const s = styles({ title: { fontWeight: '600' } });

/**
 * A toned block carrying one message, and sometimes the action that answers it.
 *
 * ```tsx
 * <Callout.Root tone="danger">
 *   <Callout.Title>{error}</Callout.Title>
 * </Callout.Root>
 *
 * <Callout.Root tone="accent" icon="info-circle">
 *   <Callout.Title>Le catalogue repond</Callout.Title>
 *   <Callout.Detail>12 modules</Callout.Detail>
 * </Callout.Root>
 * ```
 */
const Callout = { Root, Media, Title, Detail, Actions };

export type { CalloutRootProps, CalloutTone };
export { Callout };
