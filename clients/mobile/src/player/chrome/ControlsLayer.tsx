// The controls themselves: scrims, title bar, transport row and the scrub bar
// with its actions. Mounted only while controls are up; every press pokes the
// auto-hide timer.
//
// The design mirrors the TV player's (@kroma/ui player parts) at phone scale;
// the UX stays the phone's own, which is why this file mirrors those parts
// rather than importing them.

import { audioTracksOf, episodeTag, formatTimecode, type MediaItem } from '@kroma/core';
import {
  BackButton,
  Box,
  fonts,
  Icon,
  IconButton,
  type IconName,
  SHADE,
  Spinner,
  shade,
  styles,
  Text,
} from '@kroma/ui/kit';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { useT } from '#mobile/lib/i18n';
import { colors, spacing } from '#mobile/lib/theme';
import type { Engine } from '#mobile/player/engine';
import { ScrubBar } from '#mobile/player/ScrubBar';
import type { SheetView } from '#mobile/player/TrackSheet';
import type { StoryboardTile } from '#mobile/player/useStoryboard';

export function ControlsLayer({
  engine,
  item,
  insets,
  poke,
  onBack,
  onOpenSheet,
  tileFor,
  next,
  onPlayNext,
  onPip,
  onCast,
}: Readonly<{
  engine: Engine;
  item: MediaItem;
  insets: EdgeInsets;
  poke(): void;
  onBack(): void;
  onOpenSheet(view?: SheetView): void;
  tileFor?: (abs: number) => StoryboardTile | null;
  next?: MediaItem | null;
  onPlayNext?(): void;
  onPip?(): void;
  onCast?(): void;
}>) {
  const t = useT();
  const title = item.showTitle ?? item.metadata?.title ?? item.title;
  // For an episode the big line is the SHOW, so the subtitle carries both the
  // tag and the episode's own name: "S1E2 · The Kingsroad", the way the TV
  // player's top bar reads.
  const tag = episodeTag(item);
  const episodeName = item.showTitle ? (item.metadata?.title ?? item.title) : undefined;
  const sub = [tag, episodeName].filter(Boolean).join(' · ') || undefined;

  const open = (view?: SheetView) => {
    onOpenSheet(view);
    poke();
  };
  // The audio shortcut earns its spot only when there is a choice to make.
  const audioCount = engine.offline ? engine.localAudio.length : audioTracksOf(item).length;

  return (
    <Box style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Box style={s.scrim} pointerEvents="none" />
      <LinearGradient
        colors={['rgba(0,0,0,0.65)', 'rgba(0,0,0,0)']}
        style={s.scrimTop}
        pointerEvents="none"
      />
      <LinearGradient
        colors={[SHADE.transparent, shade(0.85)]}
        style={s.scrimBottom}
        pointerEvents="none"
      />
      <Box
        style={[
          s.topBar,
          {
            paddingTop: insets.top + 6,
            paddingLeft: Math.max(insets.left, spacing.md),
            paddingRight: Math.max(insets.right, spacing.md),
          },
        ]}
        pointerEvents="box-none"
      >
        <BackButton size={42} onPress={onBack} label={t('common.back')} />
        {/* Beside the back button, like the TV bar: the title reads from the
            corner, not the centre of the picture. */}
        <Box style={s.titleBox}>
          <Text lines={1} style={s.title}>
            {title}
          </Text>
          {sub ? (
            <Text lines={1} style={s.subtitle}>
              {sub}
            </Text>
          ) : null}
        </Box>
      </Box>

      <Box style={s.centerRow} pointerEvents="box-none">
        <IconButton
          size={56}
          icon="rewind-backward-10"
          glyph={28}
          onPress={() => {
            engine.skip(-10);
            poke();
          }}
          label={t('player.back10')}
        />
        {/* Buffering lives IN the play button while controls are up: a second
            spinner floating behind the cluster read as two half-drawn
            controls fighting over the same centre. */}
        <IconButton
          size={72}
          variant="primary"
          onPress={() => {
            engine.togglePlay();
            poke();
          }}
          label={engine.playing ? t('player.pause') : t('player.play')}
        >
          {(() => {
            if (engine.waiting) return <Spinner size={30} color={colors.accentInk} />;
            const glyph = engine.playing ? 'player-pause-filled' : 'player-play-filled';
            return <Icon name={glyph} size={engine.playing ? 30 : 32} color={colors.accentInk} />;
          })()}
        </IconButton>
        <IconButton
          size={56}
          icon="rewind-forward-10"
          glyph={28}
          onPress={() => {
            engine.skip(10);
            poke();
          }}
          label={t('player.fwd10')}
        />
      </Box>

      <Box
        style={[
          s.bottomBar,
          {
            paddingBottom: Math.max(insets.bottom, 12),
            paddingLeft: Math.max(insets.left, spacing.md),
            paddingRight: Math.max(insets.right, spacing.md),
          },
        ]}
      >
        <ScrubRow engine={engine} onInteract={poke} tileFor={tileFor} item={item} />
        {/* Icon-only: labels ride on accessibility, not the row itself. */}
        <Box style={s.actionsRow}>
          <Box style={s.actionsGroup}>
            {audioCount > 1 ? (
              <RowShortcut
                icon="wave-sine"
                label={t('player.audioTracks')}
                onPress={() => open('audio')}
              />
            ) : null}
            <RowShortcut
              icon="badge-cc"
              label={t('player.subtitles')}
              onPress={() => open('subtitles')}
            />
            <RowShortcut icon="gauge" label={t('player.speed')} onPress={() => open('speed')} />
          </Box>
          <Box style={s.actionsGroup}>
            {next && onPlayNext ? (
              <RowShortcut
                icon="player-track-next"
                label={t('player.nextEpisode')}
                onPress={onPlayNext}
              />
            ) : null}
            {onCast ? (
              <RowShortcut
                icon="cast"
                label={t('cast.moveToTv')}
                onPress={() => {
                  onCast();
                  poke();
                }}
              />
            ) : null}
            {onPip ? (
              <RowShortcut
                icon="picture-in-picture"
                label={t('player.pip')}
                onPress={() => {
                  onPip();
                  poke();
                }}
              />
            ) : null}
            <RowShortcut icon="settings" label={t('player.settings')} onPress={() => open()} />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

function RowShortcut({
  icon,
  label,
  onPress,
}: Readonly<{ icon: IconName; label: string; onPress(): void }>) {
  return <IconButton size={40} icon={icon} glyph={20} onPress={onPress} label={label} />;
}

function ScrubRow({
  engine,
  onInteract,
  tileFor,
  item,
}: Readonly<{
  engine: Engine;
  onInteract(): void;
  tileFor?: (abs: number) => StoryboardTile | null;
  item: MediaItem;
}>) {
  const markers = (item.markers ?? []).map((m) => m.startMs / 1000);
  return (
    <Box>
      <ScrubBar
        cur={engine.cur}
        dur={engine.dur}
        buffered={engine.buffered}
        tileFor={tileFor}
        markers={markers}
        onSeek={(abs) => {
          engine.seekTo(abs);
          onInteract();
        }}
      />
      <Box style={s.timeRow}>
        <Text style={s.time}>{formatTimecode(engine.cur)}</Text>
        <Text style={s.time}>{formatTimecode(engine.dur)}</Text>
      </Box>
    </Box>
  );
}

const s = styles({
  scrim: { fill: true, bg: 'bg/22' },
  scrimTop: { absolute: true, top: 0, right: 0, left: 0, h: 120 },
  scrimBottom: { absolute: true, right: 0, bottom: 0, left: 0, h: 160 },
  topBar: { row: true, align: 'center', gap: 12 },
  titleBox: { flex: true, minW: 0 },
  title: { fontFamily: fonts.display, color: 'white', fontSize: 17, fontWeight: '700' },
  subtitle: { mt: 1, color: 'text/60', fontSize: 12, fontWeight: '500' },
  centerRow: { flex: true, row: true, center: true, gap: 40 },
  bottomBar: { px: spacing.md },
  actionsRow: { row: true, between: true, align: 'center', mt: 10 },
  actionsGroup: { row: true, align: 'center', gap: 12 },
  timeRow: { row: true, between: true, mt: 6 },
  time: { color: 'text/50', fontSize: 12, fontVariant: ['tabular-nums'] },
});
