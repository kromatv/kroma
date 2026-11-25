import {
  activeTheme,
  Box,
  CheckboxFace,
  color,
  Focusable,
  IconButton,
  Text,
  useStyleScope,
  useStyles,
  useThemeVersion,
  WatchedBadge,
} from '@kromatv/ui/kit';
import { useWebRuntime } from '#web/shared/lib/web-runtime';

// One line of a season: an owned, playable episode, or a gap the viewer can
// request. The whole row is the control, so the trailing edit / report /
// watched buttons are actions inside it rather than a second stop beside it.

import type { MediaItem } from '@kromatv/client/media';
import {
  datedDayLabel,
  formatRuntime,
  posterColors,
  relativeAirDate,
  sentenceCase,
} from '@kromatv/core';
import { useLocale, useT } from '@kromatv/ui';

import { IconPlayerPlayFilled } from '@tabler/icons-react';
import { EpisodeEditButtons } from '#web/features/catalog/episode-edit-buttons.component';
import {
  episodeRow,
  episodeRowStyles,
  missingRow,
  ROW_GAP,
  STILL_W,
} from '#web/features/catalog/episode-row-styles';
import { ReportDialog } from '#web/features/catalog/report-dialog.component';

import { wash } from '#web/shared/lib/art-styles';
import type { SeasonGap } from '#web/shared/lib/title-seasons';
import { Image } from '#web/shared/ui';
import { RequestStatusChip } from '#web/shared/ui/request-status-chip.component';

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
  const webRuntime = useWebRuntime();

  const scope = useStyleScope();
  useThemeVersion();

  const s = useStyles(episodeRowStyles);

  const t = useT();
  const [g1, g2] = posterColors(episode.id);
  const runtime = formatRuntime(t, episode.durationMs);
  const synopsis = episode.metadata?.overview;
  const still = webRuntime.client.media.artwork.backdropFor(episode);
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
            style={wash(g1, g2, 135, scope)}
          >
            <Image src={still} fit="cover" fill style={watched ? s.dimmed : undefined} />
            <Box fill style={s.scrim} />
            {watched ? <WatchedBadge size={28} /> : null}
            <Box w={44} h={44} center radius="circle" bg="bg/50" style={hovered ? s.lift : s.frost}>
              <IconPlayerPlayFilled size={18} color={color('white', activeTheme(scope.theme))} />
            </Box>
            {progress != null && !watched ? (
              <Box absolute start={0} end={0} bottom={0} h={4} bg="white/25">
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

          <EpisodeEditButtons episode={episode} title={reportLabel} />
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

/** A gap in the season the viewer can ask for. The whole row is the toggle, so
 * picking three episodes is three presses and one request from the bar below;
 * a row already asked for shows its status instead. What the provider lists
 * for the episode (title, still, air date, synopsis, runtime) rides along once
 * enrichment has fetched the season. */
export function MissingEpisodeRow({
  episode,
  listed,
  pending,
  selected,
  onToggle,
}: Readonly<{
  season: number;
  episode: number;
  listed: SeasonGap | null;
  pending: boolean;
  selected: boolean;
  onToggle: () => void;
}>) {
  const t = useT();
  const label = listed?.title
    ? `${episode}. ${listed.title}`
    : t('content.episodeN', { n: episode });
  if (pending) {
    return (
      <Box row align="center" gap={ROW_GAP} radius="xl" p={14} bg="white/1.5" border="white/5">
        <MissingStill episode={episode} still={listed?.stillUrl ?? null} />
        <MissingText label={label} listed={listed} color="white/70" />
        <RequestStatusChip status="pending" size="card" />
      </Box>
    );
  }
  return (
    <Focusable
      role="checkbox"
      checked={selected}
      sv={missingRow}
      vars={{ selected }}
      label={label}
      onPress={onToggle}
    >
      <MissingStill episode={episode} still={listed?.stillUrl ?? null} />
      <MissingText label={label} listed={listed} color={selected ? 'text' : 'white/70'} />
      <CheckboxFace checked={selected} />
    </Focusable>
  );
}

function runtimeMinOf(listed: SeasonGap | null): number {
  if (!listed || !('runtimeMin' in listed)) {
    return 0;
  }
  return listed.runtimeMin ?? 0;
}

function MissingText({
  label,
  listed,
  color: tone,
}: Readonly<{ label: string; listed: SeasonGap | null; color: 'text' | 'white/70' }>) {
  const s = useStyles(episodeRowStyles);

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
  const runtime = formatRuntime(t, runtimeMinOf(listed) * 60_000);
  if (runtime) {
    facts.push(runtime);
  }
  return (
    <Box minW={0} flex>
      <Box row align="center" gap={10} mb={6}>
        <Text variant="label" lines={1} color={tone} style={s.bold}>
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
  const webRuntime = useWebRuntime();

  const s = useStyles(episodeRowStyles);

  const src = webRuntime.client.media.artwork.resolve(still);
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
