import { useStyles } from '#ui/core/styles';
import { fontSizes as textSizes } from '#ui/core/tokens';
// One row of the palette, and the empty face the list falls back to.

import type { StyleProp, TextStyle } from 'react-native';
import { Badge } from '#ui/components/atoms/badge';
import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { Icon } from '#ui/components/atoms/icon';
import { IconWell } from '#ui/components/atoms/icon-well';
import { Img } from '#ui/components/atoms/img';
import { Text } from '#ui/components/atoms/text';
import { styles, sv } from '#ui/core';
import { matchText, textRuns } from '#ui/lib/text-match';
import { type CommandItem, isTall, METRICS } from './command-list';

const MARK = 30;
const POSTER = { w: MARK, h: 45 };

/** Where the sheet's content starts: a heading, a row's mark and the footer's first key
 *  all share this left edge, which leaves a mark as far from the side of its row as from
 *  the top and the bottom. */
const GUTTER = METRICS.pad + (METRICS.row - MARK) / 2;
const POSTER_FADE_MS = 120;

interface CommandRowProps {
  item: CommandItem;
  /** What is typed, whose letters are marked on the label. */
  query: string;
  /** The row that is already open behind the palette. */
  open: boolean;
  /** The row the keyboard cursor is on. */
  cursor: boolean;
  /** Both are handed the row's `item`, so one handler serves the whole list
   *  rather than a closure per row. */
  onHover: (item: CommandItem) => void;
  onPress: (item: CommandItem) => void;
}

function CommandRow({ item, query, open, cursor, onHover, onPress }: Readonly<CommandRowProps>) {
  const s = useStyles(sDefinition);
  const tall = isTall(item);
  const trailing = item.meta ?? (query.trim() && !item.subtitle ? item.group : undefined);

  return (
    <Focusable
      label={item.label}
      ring={false}
      // The pointer moves the SAME cursor the arrows do, rather than lighting a
      // second row of its own: with two highlights on screen, Enter opens
      // whichever one the reader was not looking at.
      onHoverIn={() => onHover(item)}
      onPress={() => onPress(item)}
      sv={row}
      vars={{ cursor, open, tall }}
    >
      {({ slots }) => (
        <>
          <RowMedia item={item} open={open} />
          <Box flex minW={0} gap={2}>
            <Text variant="meta" style={slots.label} lines={1}>
              <Marked text={item.label} query={query} hitStyle={s.hit} />
            </Text>
            {item.subtitle ? (
              <Text variant="meta" color="textDim" style={s.meta} lines={1}>
                <Marked text={item.subtitle} query={query} hitStyle={s.metaHit} strict />
              </Text>
            ) : null}
          </Box>
          {trailing ? (
            <Text variant="meta" color="textDim" style={s.meta} lines={1}>
              {trailing}
            </Text>
          ) : null}
          {item.status ? (
            <Box shrink={0}>
              <Badge tone={item.status.tone ?? 'neutral'}>{item.status.label}</Badge>
            </Box>
          ) : null}
          {open ? <Box w={5} h={5} radius="pill" bg="accent" /> : null}
        </>
      )}
    </Focusable>
  );
}

function Marked({
  text,
  query,
  hitStyle,
  strict,
}: Readonly<{
  text: string;
  query: string;
  hitStyle: StyleProp<TextStyle>;
  strict?: boolean;
}>) {
  return textRuns(text, matchText(text, query, { strict })).map((run) =>
    run.hit ? (
      <Text key={run.at} variant="meta" color="accentText" style={hitStyle}>
        {run.text}
      </Text>
    ) : (
      run.text
    ),
  );
}

function RowMedia({ item, open }: Readonly<{ item: CommandItem; open: boolean }>) {
  const { icon, image, imageShape } = item;
  if (!icon && !image) return null;
  if (!image || imageShape === 'tile') {
    return (
      <IconWell name={icon ?? 'photo'} size="xs" tone={open ? 'accent' : 'neutral'} src={image} />
    );
  }
  return (
    <Box w={POSTER.w} h={POSTER.h} shrink={0} center radius="sm" overflow="hidden" bg="tint/6">
      <Img
        src={image}
        fill
        opaque
        noCrossFade
        duration={POSTER_FADE_MS}
        fallback={icon ? <Icon name={icon} size={16} color="textMuted" /> : null}
      />
    </Box>
  );
}

const sDefinition = styles({
  meta: { fontSize: textSizes.overlineRaised },
  hit: { fontSize: textSizes.metaRaised, fontWeight: '600' },
  metaHit: { fontSize: textSizes.overlineRaised },
});

// The sheet is a lifted surface, where the chrome's plain focus wash reads as
// nothing; the keyboard cursor wears the same coat as focus, since only one of
// the two drives at a time.
const row = sv({
  slots: {
    root: {
      row: true,
      align: 'center',
      gap: 12,
      h: METRICS.row,
      px: GUTTER - METRICS.pad,
      radius: 'sm',
      _focus: { bg: 'tint/7' },
    },
    label: { fontSize: textSizes.metaRaised, fontWeight: '600', color: 'textMuted' },
  },
  variants: {
    cursor: { true: { root: { bg: 'tint/7' }, label: { color: 'text' } } },
    open: { true: { label: { color: 'accentText' } } },
    tall: { true: { root: { h: METRICS.tallRow } } },
  },
  defaults: { cursor: false, open: false, tall: false },
});

export type { CommandRowProps };
export { CommandRow, GUTTER };
