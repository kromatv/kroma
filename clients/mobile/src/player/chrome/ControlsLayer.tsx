// The controls themselves: scrims, title bar, transport row and the scrub bar
// with its actions. Mounted only while the controls are up; every press pokes
// the auto-hide timer so touching a control keeps them on screen.
//
// The DESIGN is the TV player's (see @kroma/ui player parts), at phone scale:
// the glass circles of its control cluster (12% white at rest, 22% pressed -
// the same numbers as the kit's CTRL_OFF / CTRL_ON), the amber play carrying
// the ink glyph, the display-face title beside a glass back button, and one
// icon-only action row under the scrub bar. The UX stays the phone's own -
// touch targets, tap-to-toggle, an auto-hide timer - which is why this file
// mirrors the TV parts rather than importing them.

import { audioTracksOf, episodeTag, formatTimecode, type MediaItem } from '@kroma/core';
import { fonts, Icon, IconButton, type IconName, Spinner } from '@kroma/ui/kit';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { useT } from '#mobile/lib/i18n';
import { absoluteFill, colors, spacing } from '#mobile/lib/theme';
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
}: Readonly<{
  engine: Engine;
  item: MediaItem;
  insets: EdgeInsets;
  /** Restart the auto-hide countdown. */
  poke(): void;
  onBack(): void;
  onOpenSheet(view?: SheetView): void;
  tileFor?: (abs: number) => StoryboardTile | null;
  next?: MediaItem | null;
  onPlayNext?(): void;
  onPip?(): void;
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
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View style={styles.scrim} pointerEvents="none" />
      <LinearGradient
        colors={['rgba(0,0,0,0.65)', 'rgba(0,0,0,0)']}
        style={styles.scrimTop}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['rgba(10,10,12,0)', 'rgba(10,10,12,0.85)']}
        style={styles.scrimBottom}
        pointerEvents="none"
      />
      <View
        style={[
          styles.topBar,
          {
            paddingTop: insets.top + 6,
            paddingLeft: Math.max(insets.left, spacing.md),
            paddingRight: Math.max(insets.right, spacing.md),
          },
        ]}
        pointerEvents="box-none"
      >
        <IconButton size={42} onPress={onBack} label={t('common.back')}>
          <Icon name="chevron-left" size={20} stroke={2.4} />
        </IconButton>
        {/* Beside the back button, the TV bar's arrangement: the title reads
            from the corner, not from the centre of the picture. */}
        <View style={styles.titleBox}>
          <Text numberOfLines={1} style={styles.title}>
            {title}
          </Text>
          {sub ? (
            <Text numberOfLines={1} style={styles.subtitle}>
              {sub}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.centerRow} pointerEvents="box-none">
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
        {/* The signature of the TV cluster: play is the one AMBER control, its
            glyph in ink. Buffering lives IN the button while the controls are
            up: a second spinner floating behind the cluster read as two
            half-drawn controls fighting over the same centre. */}
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
      </View>

      <View
        style={[
          styles.bottomBar,
          {
            paddingBottom: Math.max(insets.bottom, 12),
            paddingLeft: Math.max(insets.left, spacing.md),
            paddingRight: Math.max(insets.right, spacing.md),
          },
        ]}
      >
        <ScrubRow engine={engine} onInteract={poke} tileFor={tileFor} item={item} />
        {/* Every secondary control lives in THIS row - the one place to look,
            the phone's reading of the TV cluster, icon-only (labels ride on
            accessibility). Left: shortcuts straight into the sheet's sub-views.
            Right: next episode, PiP, and the gear for the full menu. */}
        <View style={styles.actionsRow}>
          <View style={styles.actionsGroup}>
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
          </View>
          <View style={styles.actionsGroup}>
            {next && onPlayNext ? (
              <RowShortcut
                icon="player-track-next"
                label={t('player.nextEpisode')}
                onPress={onPlayNext}
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
          </View>
        </View>
      </View>
    </View>
  );
}

/** One action-row control: the row's uniform 40pt glass circle. */
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
    <View>
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
      <View style={styles.timeRow}>
        <Text style={styles.time}>{formatTimecode(engine.cur)}</Text>
        <Text style={styles.time}>{formatTimecode(engine.dur)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { ...absoluteFill, backgroundColor: 'rgba(10, 10, 12, 0.22)' },
  scrimTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 120 },
  scrimBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 160 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titleBox: { flex: 1, minWidth: 0 },
  title: { fontFamily: fonts.display, color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  subtitle: { color: 'rgba(244, 243, 240, 0.6)', fontSize: 12, fontWeight: '500', marginTop: 1 },
  centerRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 40,
  },
  bottomBar: { paddingHorizontal: spacing.md },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  actionsGroup: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  time: { color: 'rgba(244, 243, 240, 0.5)', fontSize: 12, fontVariant: ['tabular-nums'] },
});
