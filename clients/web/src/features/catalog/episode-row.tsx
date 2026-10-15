// One line of a season: an owned, playable episode, or a gap the viewer can
// request. The whole row is the control, so the trailing report / watched
// buttons are actions inside it rather than a second stop beside it.

import type { MediaItem } from '@kromatv/client/media';
import {
  datedDayLabel,
  formatRuntime,
  posterColors,
  relativeAirDate,
  sentenceCase,
} from '@kromatv/core';
import { useLocale, useT } from '@kromatv/ui';
import {
  Box,
  backdropBlur,
  CheckboxFace,
  color,
  Focusable,
  type HostElement,
  IconButton,
  styles,
  sv,
  Text,
  WatchedBadge,
} from '@kromatv/ui/kit';
import { IconPlayerPlayFilled } from '@tabler/icons-react';
import { useState } from 'react';
import { ReportDialog } from '#web/features/catalog/report-dialog';
import { kromaClient } from '#web/shared/lib/api';
import { wash } from '#web/shared/lib/art-styles';
import type { SeasonGap } from '#web/shared/lib/titleView';
import { Image } from '#web/shared/ui';
import { RequestStatusChip } from '#web/shared/ui/request-status-chip';

const ROW_GAP = { base: 12, md: 20 } as const;
const STILL_W = { base: 128, md: 200 } as const;
const s = styles({
  bold: { fontWeight: '700' },
  dimmed: { opacity: 0.6 },
  frost: backdropBlur(2),
  lift: { ...backdropBlur(2), transform: [{ scale: 1.1 }] },
  rowHover: { bg: 'white/5' },
  scrim: {
    backgroundImage: `linear-gradient(170deg, ${color('black/5')}, ${color('black/45')})`,
  },
});

const episodeRow = sv({
  base: {
    row: true,
    align: 'center',
    gap: ROW_GAP,
    radius: 'xl',
    p: 14,
    bg: 'white/2.5',
    border: 'white/5',
    _hover: { bg: 'white/6' },
  },
  variants: {
    watched: { true: { border: 'accent/30' }, false: {} },
  },
  defaults: { watched: false },
});

export function EpisodeRow({
  episode,
  watched,
  progress,
  onPlay,
  onToggleWatched,
}: Readonly<{
  episode: MediaItem;
  progress: number | null;
  watched: boolean;
  onPlay: () => void;
  onToggleWatched: () => void;
}>) {
  const t = useT();
  const [g1, g2] = posterColors(episode.id);
  const runtime = formatRuntime(episode.durationMs);
  const synopsis = episode.metadata?.overview;
  const still = kromaClient().media.artwork.backdropFor(episode);
  const num =
    episode.season != null && episode.episode != null
      ? `S${String(episode.season).padStart(2, '0')}E${String(episode.episode).padStart(2, '0')} · `
      : '';
  const reportLabel = `${num}${episode.episodeTitle ?? episode.title}`;
  return (
    <Focusable
      sv={episodeRow}
      vars={{ watched }}
      label={episode.episodeTitle ?? episode.title}
      onPress={onPlay}
    >
      {({ hovered }) => (
        <>
          <Box
            w={STILL_W}
            aspect={16 / 9}
            shrink={0}
            center
            overflow="hidden"
            radius="md"
            style={wash(g1, g2, 135)}
          >
            <Image src={still} fit="cover" fill style={watched ? s.dimmed : undefined} />
            <Box fill style={s.scrim} />
            {watched ? <WatchedBadge size={28} /> : null}
            <Box w={44} h={44} center radius="circle" bg="bg/50" style={hovered ? s.lift : s.frost}>
              <IconPlayerPlayFilled size={18} color={color('white')} />
            </Box>
            {progress != null && !watched ? (
              <Box absolute left={0} right={0} bottom={0} h={4} bg="white/25">
                <Box h="100%" bg="accent" w={`${progress}%`} />
              </Box>
            ) : null}
          </Box>

          <Box minW={0} flex>
            <Box row align="center" gap={10} mb={6}>
              <Text variant="label" lines={1} color={watched ? 'white/55' : 'text'} style={s.bold}>
                {`${episode.episode}. ${episode.episodeTitle ?? episode.title}`}
              </Text>
              {runtime ? (
                <Text variant="meta" color="white/45" shrink={0}>
                  {runtime}
                </Text>
              ) : null}
            </Box>
            {synopsis ? (
              <Text variant="meta" color="white/60" lines={2}>
                {synopsis}
              </Text>
            ) : null}
          </Box>

          <IconButton
            icon="flag"
            label={t('report.action')}
            onPress={() =>
              void ReportDialog.call({
                subjectKind: 'episode',
                subjectId: episode.id,
                subjectTitle: reportLabel,
              })
            }
          />
          <IconButton
            icon="check"
            active={watched}
            pressed={watched}
            label={watched ? t('content.markUnwatched') : t('content.markWatched')}
            onPress={onToggleWatched}
          />
        </>
      )}
    </Focusable>
  );
}

const missingPick = sv({
  base: { row: true, align: 'center', gap: ROW_GAP, radius: 'xl', flex: true, minW: 0 },
});

/** A gap in the season. `watch` is the link the play action beside the toggle
 * follows, inside the same row. */
export function MissingEpisodeRow({
  episode,
  listed,
  pending,
  selected,
  onToggle,
  watch,
}: Readonly<{
  season: number;
  episode: number;
  listed: SeasonGap | null;
  pending: boolean;
  selected: boolean;
  onToggle: (() => void) | null;
  watch: HostElement | null;
}>) {
  const t = useT();
  const [hovered, setHovered] = useState(false);
  const label = listed?.title
    ? `${episode}. ${listed.title}`
    : t('content.episodeN', { n: episode });
  const play = watch ? (
    <IconButton icon="player-play-filled" label={t('discover.watch')} asChild>
      {watch}
    </IconButton>
  ) : null;
  if (pending || !onToggle) {
    return (
      <Box row align="center" gap={ROW_GAP} radius="xl" p={14} bg="white/1.5" border="white/5">
        <MissingStill episode={episode} still={listed?.stillUrl ?? null} />
        <MissingText label={label} listed={listed} color="white/70" />
        {pending ? <RequestStatusChip status="pending" size="card" /> : null}
        {play}
      </Box>
    );
  }
  return (
    <Box
      row
      align="center"
      gap={ROW_GAP}
      radius="xl"
      p={14}
      bg={selected ? 'accentWash/8' : 'white/1.5'}
      border={selected ? 'accent/45' : 'white/5'}
      style={hovered ? s.rowHover : null}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <Focusable
        role="checkbox"
        checked={selected}
        sv={missingPick}
        label={label}
        onPress={onToggle}
      >
        <MissingStill episode={episode} still={listed?.stillUrl ?? null} />
        <MissingText label={label} listed={listed} color={selected ? 'text' : 'white/70'} />
        <CheckboxFace checked={selected} />
      </Focusable>
      {play}
    </Box>
  );
}

function runtimeMinOf(listed: SeasonGap | null): number {
  if (!listed || !('runtimeMin' in listed)) return 0;
  return listed.runtimeMin ?? 0;
}

function MissingText({
  label,
  listed,
  color,
}: Readonly<{ label: string; listed: SeasonGap | null; color: 'text' | 'white/70' }>) {
  const t = useT();
  const locale = useLocale();
  const airDate = listed?.airDate ?? null;
  const facts: string[] = [];
  if (airDate) {
    facts.push(
      sentenceCase(relativeAirDate(airDate, locale), locale),
      datedDayLabel(airDate, locale),
    );
  } else if (listed) {
    facts.push(t('requests.noDate'));
  }
  const runtime = formatRuntime(runtimeMinOf(listed) * 60_000);
  if (runtime) facts.push(runtime);
  return (
    <Box minW={0} flex>
      <Box row align="center" gap={10} mb={6}>
        <Text variant="label" lines={1} color={color} style={s.bold}>
          {label}
        </Text>
        {facts.length > 0 ? (
          <Text variant="meta" color="white/45" shrink={0}>
            {facts.join(' · ')}
          </Text>
        ) : null}
      </Box>
      {listed?.overview ? (
        <Text variant="meta" color="white/60" lines={2}>
          {listed.overview}
        </Text>
      ) : null}
    </Box>
  );
}

function MissingStill({ episode, still }: Readonly<{ episode: number; still: string | null }>) {
  const src = kromaClient().media.artwork.resolve(still);
  return (
    <Box w={STILL_W} aspect={16 / 9} shrink={0} center overflow="hidden" radius="md" bg="white/4">
      {src ? (
        <>
          <Image src={src} fit="cover" fill style={s.dimmed} />
          <Box fill style={s.scrim} />
        </>
      ) : (
        <Text variant="label" color="white/35" style={s.bold}>
          {String(episode)}
        </Text>
      )}
    </Box>
  );
}
