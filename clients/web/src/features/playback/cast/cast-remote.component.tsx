// The keys and the seek line of the docked remote, for a film that is playing
// on a television. Seeking is the player's own: the same seek bar, the same
// coalesced skips and the same storyboard, driven through `useCastScrub`.

import type { CastNowPlaying } from '@kromatv/client/cast';
import {
  type Cast,
  SeekBar,
  type SeekNudge,
  SKIP_BACK_ICON,
  SKIP_FORWARD_ICON,
  useCastPosition,
  useSeekNudge,
  useT,
} from '@kromatv/ui';
import { formatTimecode } from '@kromatv/ui/intl';
import { Box, Row, styles, Text, useStyles } from '@kromatv/ui/kit';
import { useStoryboard } from '#web/shared/lib/use-storyboard.hook';
import { TransportButton } from './transport-button.component';
import { type CastScrub, useCastScrub } from './use-cast-scrub.hook';

const NO_CHAPTERS: never[] = [];
const NOOP = () => undefined;
const THUMB_WIDTH = 200;
const BAR_SCALE = 0.7;

interface CastRemoteProps {
  playing: CastNowPlaying;
  send: Cast['send'];
  /** Whether there is room for the seek line under the keys. */
  scrub: boolean;
}

export function CastRemote({ playing, send, scrub }: Readonly<CastRemoteProps>) {
  const positionMs = useCastPosition();
  const target = useCastScrub({ positionMs, durationMs: playing.durationMs ?? 0, send });
  const { nudge } = useSeekNudge(target);
  return (
    <>
      <Keys playing={playing} send={send} nudge={nudge} />
      {scrub ? <SeekLine playing={playing} target={target} nudge={nudge} /> : null}
    </>
  );
}

interface KeysProps {
  playing: CastNowPlaying;
  send: Cast['send'];
  nudge: SeekNudge['nudge'];
}

function Keys({ playing, send, nudge }: Readonly<KeysProps>) {
  const t = useT();
  // Buffering is playing, stalled: the button a viewer needs is still Pause.
  const isPlaying = playing.state === 'playing' || playing.state === 'buffering';
  return (
    <Row gap={4}>
      <TransportButton
        icon={SKIP_BACK_ICON}
        label={t('player.back10')}
        onPress={() => nudge(-1, 'tap')}
      />
      <PlayPause playing={isPlaying} onPress={() => void send({ type: 'togglePlay' })} />
      <TransportButton
        icon={SKIP_FORWARD_ICON}
        label={t('player.fwd10')}
        onPress={() => nudge(1, 'tap')}
      />
      {playing.item.kind === 'episode' ? (
        <TransportButton
          icon="player-track-next"
          label={t('player.nextEpisode')}
          onPress={() => void send({ type: 'skipNext' })}
        />
      ) : null}
    </Row>
  );
}

function PlayPause({ playing, onPress }: Readonly<{ playing: boolean; onPress: () => void }>) {
  const t = useT();
  return (
    <TransportButton
      icon={playing ? 'player-pause-filled' : 'player-play-filled'}
      label={t(playing ? 'player.pause' : 'player.play')}
      onPress={onPress}
      primary
    />
  );
}

function Timecode({ children }: Readonly<{ children: string }>) {
  const s = useStyles(sDefinition);
  return (
    <Text variant="meta" color="textDim" shrink={0} style={s.tabular}>
      {children}
    </Text>
  );
}

interface SeekLineProps {
  playing: CastNowPlaying;
  target: CastScrub;
  nudge: SeekNudge['nudge'];
}

function SeekLine({ playing, target, nudge }: Readonly<SeekLineProps>) {
  const elapsed = formatTimecode(target.seekPreview ?? target.cur);
  return (
    <Row w="100%" gap={12}>
      <Timecode>{elapsed}</Timecode>
      <Box flex minW={0}>
        <Track playing={playing} target={target} nudge={nudge} elapsed={elapsed} />
      </Box>
      <Timecode>{target.dur ? formatTimecode(target.dur) : '--:--'}</Timecode>
    </Row>
  );
}

interface TrackProps {
  playing: CastNowPlaying;
  target: CastScrub;
  nudge: SeekNudge['nudge'];
  elapsed: string;
}

// The player's own seek bar, drawn alone: the times are printed beside it, and
// a remote has no chapters and no focus ring to report.
function Track({ playing, target, nudge, elapsed }: Readonly<TrackProps>) {
  const storyboard = useStoryboard(playing.item.id);
  const { bufferedMs } = playing;
  return (
    <SeekBar
      cur={target.cur}
      dur={target.dur}
      bufEnd={bufferedMs === undefined ? null : bufferedMs / 1000}
      seekPreview={target.seekPreview}
      chapters={NO_CHAPTERS}
      tileAt={(sec) => storyboard.tile(sec, THUMB_WIDTH)}
      elapsed={elapsed}
      total=""
      endsAt=""
      labels="none"
      scale={BAR_SCALE}
      onScrub={target.scrubPreview}
      onScrubCommit={target.scrubCommit}
      onActivate={NOOP}
      onNudge={(dir) => nudge(dir, 'tap')}
      onFocus={NOOP}
      onBlur={NOOP}
    />
  );
}

const sDefinition = styles({
  tabular: { fontVariant: ['tabular-nums'] },
});
