// One line of a season: an owned, playable episode, or a gap the viewer can
// request. The whole row is the control, so the trailing report / watched
// buttons are actions inside it rather than a second stop beside it.

import { formatRuntime, type MediaItem, posterColors } from '@kroma/core';
import { useT } from '@kroma/ui';
import {
  Box,
  backdropBlur,
  CheckboxFace,
  color,
  Focusable,
  gradient,
  IconButton,
  sv,
  Text,
} from '@kroma/ui/kit';
import { IconCheck, IconPlayerPlayFilled } from '@tabler/icons-react';
import { ReportDialog } from '#web/features/catalog/report-dialog';
import { kromaClient } from '#web/shared/lib/api';
import { Image } from '#web/shared/ui';
import { RequestStatusChip } from '#web/shared/ui/request-status-chip';

const ROW_GAP = { base: 12, md: 20 } as const;
const STILL_W = { base: 128, md: 200 } as const;
const BOLD = { fontWeight: '700' } as const;
const DIMMED = { opacity: 0.6 } as const;
const PLAY_FROST = backdropBlur(2);
const PLAY_LIFT = { ...PLAY_FROST, transform: [{ scale: 1.1 }] } as const;

const STILL_SCRIM = gradient(`linear-gradient(170deg, ${color('black/5')}, ${color('black/45')})`);

const episodeRow = sv({
  base: {
    row: true,
    align: 'center',
    gap: ROW_GAP,
    radius: 'lg',
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
  const still = kromaClient().backdropFor(episode);
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
            style={gradient(`linear-gradient(135deg, ${g1}, ${g2})`)}
          >
            <Image src={still} fit="cover" fill style={watched ? DIMMED : undefined} />
            <Box fill style={STILL_SCRIM} />
            {watched ? (
              <Box absolute left={8} top={8} w={24} h={24} center radius="circle" bg="accent">
                <IconCheck size={14} stroke={3} color={color('black')} />
              </Box>
            ) : null}
            <Box
              w={44}
              h={44}
              center
              radius="circle"
              bg="bg/50"
              style={hovered ? PLAY_LIFT : PLAY_FROST}
            >
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
              <Text variant="label" lines={1} color={watched ? 'white/55' : 'text'} style={BOLD}>
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
            label={watched ? t('content.markUnwatched') : t('content.markWatched')}
            onPress={onToggleWatched}
          />
        </>
      )}
    </Focusable>
  );
}

const missingRow = sv({
  base: {
    row: true,
    align: 'center',
    gap: ROW_GAP,
    radius: 'lg',
    p: 14,
    bg: 'white/1.5',
    border: 'white/5',
    _hover: { bg: 'white/5' },
  },
  variants: {
    selected: { true: { border: 'accent/45', bg: 'accentWash/8' }, false: {} },
  },
  defaults: { selected: false },
});

/** A gap in the season the viewer can ask for. The whole row is the toggle, so
 * picking three episodes is three presses and one request from the bar below;
 * a row already asked for shows its status instead. */
export function MissingEpisodeRow({
  episode,
  pending,
  selected,
  onToggle,
}: Readonly<{
  season: number;
  episode: number;
  pending: boolean;
  selected: boolean;
  onToggle: () => void;
}>) {
  const t = useT();
  const label = t('content.episodeN', { n: episode });
  if (pending) {
    return (
      <Box row align="center" gap={ROW_GAP} radius="lg" p={14} bg="white/1.5" border="white/5">
        <MissingStill episode={episode} />
        <Box minW={0} flex>
          <Text variant="label" lines={1} color="white/70" style={BOLD}>
            {label}
          </Text>
        </Box>
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
      <MissingStill episode={episode} />
      <Box minW={0} flex>
        <Text variant="label" lines={1} color={selected ? 'text' : 'white/70'} style={BOLD}>
          {label}
        </Text>
      </Box>
      <CheckboxFace checked={selected} />
    </Focusable>
  );
}

function MissingStill({ episode }: Readonly<{ episode: number }>) {
  return (
    <Box w={STILL_W} aspect={16 / 9} shrink={0} center radius="md" bg="white/4">
      <Text variant="label" color="white/35" style={BOLD}>
        {String(episode)}
      </Text>
    </Box>
  );
}
