// The controls themselves: scrims, title bar, transport row and the scrub bar
// with its actions. Mounted only while controls are up; every press pokes the
// auto-hide timer, and a finger on the controls or a scrub in flight holds it off.
//
// The design mirrors the TV player's (@kromatv/ui player parts) at phone scale;
// the UX stays the phone's own, which is why this file mirrors those parts
// rather than importing them.

import type { Arrival } from '@kromatv/core';
import { BACK_10_ICON, FWD_10_ICON } from '@kromatv/ui';
import { formatTimecode } from '@kromatv/ui/intl';
import {
  ArrivalBadge,
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
} from '@kromatv/ui/kit';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { useT } from '#mobile/lib/i18n';
import { colors, spacing } from '#mobile/lib/theme';
import { useControlsHold } from '#mobile/player/chrome/useControlsHold';
import { ScrubBar } from '#mobile/player/ScrubBar';
import type { StoryboardTile } from '#mobile/player/useStoryboard';

export interface ChromePlayback {
  cur: number;
  dur: number;
  buffered: number;
  downloaded?: readonly (readonly [number, number])[];
  playing: boolean;
  waiting: boolean;
  togglePlay(): void;
  seekTo(abs: number): void;
  skip(delta: number): void;
}

/** Each action draws only where the screen hands one over, so a file with no
 * catalogue row is missing the rows it cannot answer rather than refusing
 * them. */
export interface ChromeActions {
  onAudio?(): void;
  onSubtitles?(): void;
  onSpeed?(): void;
  onSettings?(): void;
  onPlayNext?(): void;
  onCast?(): void;
  onPip?(): void;
}

export function ControlsLayer({
  playback,
  title,
  subtitle,
  arrival,
  insets,
  poke,
  hold,
  onBack,
  markers,
  tileFor,
  actions,
}: Readonly<{
  playback: ChromePlayback;
  title: string;
  subtitle?: string;
  arrival?: Arrival;
  insets: EdgeInsets;
  poke?(): void;
  hold?(): () => void;
  onBack(): void;
  markers?: readonly number[];
  tileFor?: (abs: number) => StoryboardTile | null;
  actions: ChromeActions;
}>) {
  const t = useT();
  const touch = useControlsHold(hold);
  const pressed = (run: () => void) => () => {
    run();
    poke?.();
  };

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      onTouchStart={touch.take}
      onTouchEnd={(e) => {
        if (e.nativeEvent.touches.length === 0) touch.give();
      }}
      onTouchCancel={touch.give}
    >
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
        <BackButton diameter={42} onPress={onBack} label={t('common.back')} />
        <Box style={s.titleBox}>
          <Text lines={1} style={s.title}>
            {title}
          </Text>
          {subtitle ? (
            <Text lines={1} style={s.subtitle}>
              {subtitle}
            </Text>
          ) : null}
        </Box>
        {arrival ? <ArrivalBadge arrival={arrival} scale={0.9} /> : null}
      </Box>

      <Box style={s.centerRow} pointerEvents="box-none">
        <IconButton
          diameter={56}
          icon={BACK_10_ICON}
          glyph={28}
          onPress={pressed(() => playback.skip(-10))}
          label={t('player.back10')}
        />
        <IconButton
          diameter={72}
          variant="primary"
          onPress={pressed(playback.togglePlay)}
          label={playback.playing ? t('player.pause') : t('player.play')}
        >
          {(() => {
            if (playback.waiting) return <Spinner size={30} color={colors.accentInk} />;
            const glyph = playback.playing ? 'player-pause-filled' : 'player-play-filled';
            return <Icon name={glyph} size={playback.playing ? 30 : 32} color={colors.accentInk} />;
          })()}
        </IconButton>
        <IconButton
          diameter={56}
          icon={FWD_10_ICON}
          glyph={28}
          onPress={pressed(() => playback.skip(10))}
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
        <ScrubRow
          playback={playback}
          onInteract={poke}
          hold={hold}
          tileFor={tileFor}
          markers={markers}
        />
        <Box style={s.actionsRow}>
          <Box style={s.actionsGroup}>
            <Shortcut icon="wave-sine" label={t('player.audioTracks')} onPress={actions.onAudio} />
            <Shortcut icon="badge-cc" label={t('player.subtitles')} onPress={actions.onSubtitles} />
            <Shortcut icon="gauge" label={t('player.speed')} onPress={actions.onSpeed} />
          </Box>
          <Box style={s.actionsGroup}>
            <Shortcut
              icon="player-track-next"
              label={t('player.nextEpisode')}
              onPress={actions.onPlayNext}
            />
            <Shortcut
              icon="cast"
              label={t('cast.moveToTv')}
              onPress={actions.onCast && pressed(actions.onCast)}
            />
            <Shortcut
              icon="picture-in-picture"
              label={t('player.pip')}
              onPress={actions.onPip && pressed(actions.onPip)}
            />
            <Shortcut icon="settings" label={t('player.settings')} onPress={actions.onSettings} />
          </Box>
        </Box>
      </Box>
    </View>
  );
}

function Shortcut({
  icon,
  label,
  onPress,
}: Readonly<{ icon: IconName; label: string; onPress?: () => void }>) {
  if (!onPress) return null;
  return <IconButton diameter={40} icon={icon} glyph={20} onPress={onPress} label={label} />;
}

function ScrubRow({
  playback,
  onInteract,
  hold,
  tileFor,
  markers,
}: Readonly<{
  playback: ChromePlayback;
  onInteract?: () => void;
  hold?: () => () => void;
  tileFor?: (abs: number) => StoryboardTile | null;
  markers?: readonly number[];
}>) {
  const scrub = useControlsHold(hold);
  return (
    <Box>
      <ScrubBar
        cur={playback.cur}
        dur={playback.dur}
        buffered={playback.buffered}
        downloaded={playback.downloaded}
        tileFor={tileFor}
        markers={markers}
        onScrubStart={scrub.take}
        onScrubEnd={scrub.give}
        onSeek={(abs) => {
          playback.seekTo(abs);
          onInteract?.();
        }}
      />
      <Box style={s.timeRow}>
        <Text style={s.time}>{formatTimecode(playback.cur)}</Text>
        <Text style={s.time}>{formatTimecode(playback.dur)}</Text>
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
