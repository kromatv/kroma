import { formatRuntime, type MediaItem, type ProgressEntry, sizedImageUrl } from '@kroma/core';
import { Box, Button, Icon, styles, Txt } from '@kroma/ui/kit';
import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { useDownloads } from '#mobile/lib/downloads';
import { useT } from '#mobile/lib/i18n';
import { usePlay } from '#mobile/lib/play';
import { useClient } from '#mobile/lib/session';
import { radius, type } from '#mobile/lib/theme';
import { DownloadButton } from './DownloadButton';
import { FadeImage } from './FadeImage';
import { ProgressRing } from './ProgressRing';

/** Enqueues every not-yet-downloaded episode; while transferring it shows x/y
 * and a tap cancels the remainder. */
export function SeasonDownload({ episodes }: Readonly<{ episodes: MediaItem[] }>) {
  const t = useT();
  const downloads = useDownloads();
  const states = episodes.map((ep) => downloads.stateFor(ep.id));
  const done = states.filter((st) => st.status === 'done').length;
  const busy = states.filter((st) => st.status === 'downloading' || st.status === 'queued').length;

  if (episodes.length === 0) return null;
  if (done === episodes.length) {
    return (
      <Box style={s.seasonDl}>
        <Icon name="check" size={16} stroke={2.4} color="accentText" />
        <Txt style={s.seasonDlLabel}>{t('offline.downloaded')}</Txt>
      </Box>
    );
  }
  if (busy > 0) {
    return (
      <Button
        variant="ghost"
        size="sm"
        hitSlop={8}
        label={`${done}/${episodes.length}`}
        onPress={() => {
          for (const ep of episodes) {
            const st = downloads.stateFor(ep.id);
            if (st.status === 'downloading' || st.status === 'queued') downloads.cancel(ep.id);
          }
        }}
      >
        <ProgressRing progress={-1} size={18} />
      </Button>
    );
  }
  return (
    <Button
      variant="ghost"
      size="sm"
      hitSlop={8}
      icon="download"
      label={t('offline.downloadSeason')}
      onPress={() => {
        for (const ep of episodes) downloads.start(ep);
      }}
    />
  );
}

export function UpNextCard({ next, frac }: Readonly<{ next: MediaItem; frac: number }>) {
  const t = useT();
  const client = useClient();
  const { play } = usePlay();
  return (
    <Pressable
      onPress={() => void play(next.id)}
      style={({ pressed }) => [s.upNextCard, pressed && { opacity: 0.85 }]}
    >
      <Box>
        <FadeImage
          uri={sizedImageUrl(client.backdropFor(next), 480)}
          seed={next.id}
          radius={radius.sm}
          style={s.upNextThumb}
        />
        {frac > 0 ? (
          <Box style={s.upNextTrack}>
            <Box style={[s.upNextFill, { width: `${frac * 100}%` }]} />
          </Box>
        ) : null}
      </Box>
      <Box style={s.upNextText}>
        <Txt style={s.upNextLabel}>{t('content.upNext')}</Txt>
        <Txt lines={2} style={s.upNextTitle}>
          {next.episode != null ? `${next.episode}. ` : ''}
          {next.episodeTitle ?? next.title}
        </Txt>
      </Box>
      <Icon name="player-play-filled" size={20} />
    </Pressable>
  );
}

export function EpisodeRow({
  episode,
  progress,
  watched,
}: Readonly<{
  episode: MediaItem;
  progress: ProgressEntry | undefined;
  watched: boolean;
}>) {
  const client = useClient();
  const router = useRouter();
  const { play } = usePlay();
  const runtime = formatRuntime(episode.durationMs);
  const total = progress?.durationMs ?? episode.durationMs ?? 0;
  const frac = progress && total > 0 ? Math.min(1, progress.positionMs / total) : 0;
  const overview = episode.metadata?.overview;
  return (
    <Pressable
      onPress={() => void play(episode.id)}
      onLongPress={() => router.push(`/item/${episode.id}` as never)}
      style={({ pressed }) => [s.episode, pressed && s.episodePressed]}
    >
      <Box>
        <FadeImage
          uri={sizedImageUrl(client.backdropFor(episode), 480)}
          seed={episode.id}
          radius={radius.sm}
          style={s.epThumb}
        />
        <Box style={s.epPlayBadge}>
          <Box style={s.epPlayCircle}>
            <Icon name="player-play-filled" size={15} />
          </Box>
        </Box>
        {frac > 0 ? (
          <Box style={s.epProgressTrack}>
            <Box style={[s.epProgressFill, { width: `${frac * 100}%` }]} />
          </Box>
        ) : null}
      </Box>
      <Box style={s.epText}>
        <Box style={s.epTitleRow}>
          <Txt lines={1} style={s.epTitle}>
            {episode.episode != null ? `${episode.episode}. ` : ''}
            {episode.episodeTitle ?? episode.title}
          </Txt>
          {watched ? <Icon name="check" size={14} stroke={2.4} color="success" /> : null}
        </Box>
        {runtime ? <Txt style={s.epMeta}>{runtime}</Txt> : null}
        {overview ? (
          <Txt lines={2} style={s.epOverview}>
            {overview}
          </Txt>
        ) : null}
      </Box>
      <DownloadButton item={episode} />
    </Pressable>
  );
}

const s = styles({
  seasonDl: { row: true, align: 'center', gap: 8 },
  seasonDlLabel: { ...type.caption, color: 'accentText', fontWeight: '600' },
  upNextCard: {
    row: true,
    align: 'center',
    gap: 12,
    p: 8,
    pr: 16,
    bg: 'surface1',
    radius: radius.md,
  },
  upNextThumb: { w: 120, h: 68 },
  upNextTrack: { absolute: true, right: 5, bottom: 5, left: 5, h: 3, bg: 'text/30', radius: 2 },
  upNextFill: { h: 3, bg: 'accent', radius: 2 },
  upNextText: { flex: true, gap: 2 },
  upNextLabel: { ...type.small, color: 'accentText', fontWeight: '700' },
  upNextTitle: { ...type.body, fontWeight: '600' },
  episode: { row: true, align: 'center', gap: 12, p: 8, radius: radius.md },
  episodePressed: { bg: 'surface1' },
  epThumb: { w: 140, h: 79 },
  epPlayBadge: { fill: true, center: true },
  epPlayCircle: { center: true, w: 34, h: 34, bg: 'bg/55', radius: 17 },
  epProgressTrack: { absolute: true, right: 5, bottom: 5, left: 5, h: 3, bg: 'text/30', radius: 2 },
  epProgressFill: { h: 3, bg: 'accent', radius: 2 },
  epText: { flex: true, gap: 3 },
  epOverview: { ...type.small, color: 'textMuted', lineHeight: 17, fontWeight: '400' },
  epTitleRow: { row: true, align: 'center', gap: 6 },
  epTitle: { ...type.body, shrink: 1, fontWeight: '600' },
  epMeta: { ...type.small },
});
