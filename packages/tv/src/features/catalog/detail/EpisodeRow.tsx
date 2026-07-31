// One episode, as a row: still, title + status pills, ends-at, recap, and the
// row's three actions as real buttons. Values ported literally from the
// design source so a diff against it stays legible.
//
// The three buttons are the row's focus stops; the card itself is not
// focusable. Down lands on play, Left/Right walk the actions, and the card
// lights up while any of them holds focus — tracked here rather than asked
// of the navigator, since a blur can arrive after the neighbour's focus.

import { episodeTag, formatRuntime, type MediaItem, posterColors } from '@kroma/core';
import { endsAtClock, useLocale, useT } from '@kroma/ui';
import {
  Badge,
  Box,
  Button,
  CARD_SCRIM,
  colors,
  Frost,
  gradient,
  Icon,
  Img,
  Progress,
  Row,
  radius,
  styles,
  Txt,
  tintGradient,
} from '@kroma/ui/kit';
import { type ReactNode, useState } from 'react';

export const EPISODE_W = 480;

export const EPISODE_COLUMNS = 1;
export const EPISODE_COLUMN_W = 1920 - 64 * 2;

const STILL_W = 240;
const PLAY_DISC = 54;

type RowAction = 'play' | 'seen' | 'report';

function episodeStill(at: {
  episode: MediaItem;
  still: string | null;
  watched: boolean;
  action: RowAction | null;
  tag: string;
  runtime: string | null;
  progress: number | null;
  inProgress: boolean;
}): ReactNode {
  return (
    <Box w={STILL_W} aspect={16 / 9} center radius="lg" overflow="hidden" bg="surface2" shrink={0}>
      {/* Every layer rounds itself and the parent still clips - same
          belt-and-braces as <MediaCard>, for the same Chrome clip bug. */}
      <Img
        src={at.still}
        background={tintGradient(posterColors(at.episode.id))}
        radius={radius.lg}
        position="50% 30%"
        fill
        style={at.watched ? s.dimmed : undefined}
      />
      <Box fill pointerEvents="none" radius="lg" style={gradient(CARD_SCRIM)} />
      <Box
        w={PLAY_DISC}
        h={PLAY_DISC}
        center
        radius="pill"
        bg={at.action === 'play' ? colors.accent : 'rgba(10, 10, 12, 0.5)'}
      >
        <Icon
          name="player-play-filled"
          size={20}
          color={at.action === 'play' ? colors.accentInk : '#FFFFFF'}
        />
      </Box>
      {at.tag ? (
        <Box absolute top={10} left={10} px={9} py={4} radius={7} bg={CHIP_BG}>
          <Txt style={s.tagChip}>{at.tag}</Txt>
        </Box>
      ) : null}
      {at.runtime ? (
        <Box absolute bottom={11} right={11} px={8} py={3} radius={6} bg={CHIP_BG}>
          <Txt style={s.runtimeChip}>{at.runtime}</Txt>
        </Box>
      ) : null}
      {at.watched ? (
        <Box absolute top={10} right={10} w={26} h={26} center radius="pill" bg={SEEN_BG}>
          <Icon name="check" size={14} color={colors.success} stroke={3} />
        </Box>
      ) : null}
      {at.inProgress ? (
        <Box absolute left={0} right={0} bottom={0}>
          <Progress value={(at.progress ?? 0) / 100} />
        </Box>
      ) : null}
    </Box>
  );
}

export function EpisodeRow({
  episode,
  still,
  watched,
  progress,
  onPlay,
  onToggleWatched,
  onReport,
  onFocus,
}: Readonly<{
  episode: MediaItem;
  still: string | null;
  watched: boolean;
  progress: number | null;
  onPlay: () => void;
  onToggleWatched: () => void;
  onReport: () => void;
  onFocus?: () => void;
}>) {
  const t = useT();
  const locale = useLocale();
  const title = episode.episodeTitle ?? episode.title;
  const synopsis = episode.metadata?.overview;
  const runtime = formatRuntime(episode.durationMs);
  const tag =
    episode.episode != null ? t('content.episodeN', { n: episode.episode }) : episodeTag(episode);
  const inProgress = progress != null && !watched;
  // "fin à 21h34": what is LEFT of the episode, since play resumes mid-way.
  const watchedPct = inProgress ? progress : 0;
  const endsAt = endsAtClock(
    episode.durationMs ? episode.durationMs * (1 - watchedPct / 100) : null,
    locale,
  );

  // Which of the three buttons holds the focus (null: the row is at rest).
  const [action, setAction] = useState<RowAction | null>(null);
  const focusAction = (a: RowAction) => () => {
    setAction(a);
    onFocus?.();
  };
  const blurAction = (a: RowAction) => () =>
    setAction((current) => (current === a ? null : current));
  const lit = action != null;

  return (
    <Box style={[s.row, watched ? s.rowWatched : null, lit ? s.rowLit : null]}>
      <Frost radius={20} />
      <Row gap={26}>
        {episodeStill({ episode, still, watched, action, tag, runtime, progress, inProgress })}

        <Box flex={1} gap={8}>
          <Row gap={12} wrap>
            <Txt variant="h2" lines={1} style={s.title}>
              {title}
            </Txt>
            {watched ? (
              <Badge tone="success" size="tv">
                {t('content.watched')}
              </Badge>
            ) : null}
            {inProgress ? (
              <Badge tone="4K" size="tv">
                {t('content.inProgress')}
              </Badge>
            ) : null}
          </Row>
          {endsAt ? (
            <Row gap={9}>
              <Icon name="clock" size={14} stroke={1.8} color="accent" />
              <Txt style={s.endsAt} color="textDim">
                {t('content.endsAtShort', { time: endsAt })}
              </Txt>
            </Row>
          ) : null}
          {synopsis ? (
            <Txt lines={3} style={s.synopsis} color={lit ? SYNOPSIS_LIT : SYNOPSIS_DIM}>
              {synopsis}
            </Txt>
          ) : null}
          <Row gap={12} wrap mt={8}>
            {/* The play action wears the amber tint always (design), which is
                the outline variant's ACTIVE coat. */}
            <Button
              variant="outline"
              active
              icon="player-play-filled"
              label={inProgress ? t('player.resume') : t('player.play')}
              style={s.actionBtn}
              onPress={onPlay}
              onFocus={focusAction('play')}
              onBlur={blurAction('play')}
            />
            <Button
              variant="outline"
              active={watched}
              icon="check"
              label={watched ? t('content.watched') : t('content.markWatched')}
              style={s.actionBtn}
              onPress={onToggleWatched}
              onFocus={focusAction('seen')}
              onBlur={blurAction('seen')}
            />
            <Button
              variant="outline"
              icon="alert-triangle"
              label={t('report.actionShort')}
              style={s.actionBtn}
              onPress={onReport}
              onFocus={focusAction('report')}
              onBlur={blurAction('report')}
            />
          </Row>
        </Box>
      </Row>
    </Box>
  );
}

const CHIP_BG = 'rgba(10, 10, 12, 0.68)';
const SEEN_BG = 'rgba(10, 10, 12, 0.72)';
const SYNOPSIS_DIM = 'rgba(244, 243, 240, 0.6)';
const SYNOPSIS_LIT = 'rgba(244, 243, 240, 0.78)';

const s = styles({
  // <Frost> blurs the artwork behind the card: CSS backdrop-filter on the
  // browser tiers, the shell's registered blur view on Apple TV.
  row: { p: 18, radius: 20, bg: 'white/2.5', border: 'white/5' },
  rowLit: { bg: 'white/6', borderColor: 'white/12' },
  rowWatched: { borderColor: 'accentWash/22' },
  dimmed: { opacity: 0.55 },
  actionBtn: { py: 12, px: 19, radius: 11 },
  tagChip: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
    letterSpacing: 0.72,
    textTransform: 'uppercase',
  },
  runtimeChip: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
    color: 'text/90',
    fontVariant: ['tabular-nums'],
  },
  title: { shrink: 1 },
  endsAt: { fontSize: 15, fontWeight: '500' },
  // Measure is the design's, not the card's: on the full-width card an
  // unclamped recap ran as one screen-wide line.
  synopsis: { fontSize: 16, lineHeight: 23, fontWeight: '400', maxW: 660 },
});
