// The docked remote, pinned to the bottom of the app shell while this browser
// drives a TV. It shows what the TV last reported, not what was last asked of
// it, with the position interpolated between the receiver's heartbeats.

import { type CastNowPlaying, formatTimecode, type MediaItem } from '@kroma/core';
import { type Cast, useCast, useT } from '@kroma/ui';
import {
  Box,
  breakpoint,
  color,
  Focusable,
  Icon,
  IconButton,
  type IconName,
  Img,
  Row,
  Text,
} from '@kroma/ui/kit';
import { useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { kromaClient } from '#web/shared/lib/api';
import { castPicker } from '#web/shared/ui/cast-picker';

const SKIP_MS = 10_000;

export function CastBar() {
  const t = useT();
  const { active, positionMs, send, select } = useCast();
  const wide = useWindowDimensions().width >= breakpoint.md;

  if (!active) return null;

  const playing = active.nowPlaying;
  const playingOn = t('cast.playingOn', { device: active.name });

  return (
    <aside
      aria-label={playingOn}
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 40,
        display: 'flex',
        flexDirection: 'column',
        borderTop: `1px solid ${color('border')}`,
        background: color('surface1/95'),
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      <Row self="center" w="100%" maxW={1024} gap={12} px={16} py={10}>
        <NowPlaying item={playing?.item} playingOn={playingOn} onSelect={select} />

        {playing ? (
          <>
            <TransportKeys playing={playing} send={send} />
            {wide ? <Scrubber playing={playing} positionMs={positionMs} send={send} /> : null}
          </>
        ) : (
          <Text flex variant="meta" color="textDim">
            {t('cast.idle')}
          </Text>
        )}

        <Transport
          icon="player-stop-filled"
          label={t('cast.stop')}
          onPress={() => {
            void send({ type: 'stop' });
            select(null);
          }}
        />
      </Row>
    </aside>
  );
}

function NowPlaying({
  item,
  playingOn,
  onSelect,
}: Readonly<{ item?: MediaItem; playingOn: string; onSelect: Cast['select'] }>) {
  const t = useT();
  const poster = item ? kromaClient().posterFor(item, 96) : null;
  return (
    <>
      {poster ? (
        <Box w={32} h={48} shrink={0}>
          <Img src={poster} radius="sm" fill />
        </Box>
      ) : null}

      <Box minW={0} shrink={0} basis={{ base: 112, md: 192 }}>
        <Text variant="meta" lines={1}>
          {item ? (item.metadata?.title ?? item.title) : t('cast.idle')}
        </Text>
        <Focusable
          label={playingOn}
          onPress={async () => {
            const picked = await castPicker({ offerLocal: true });
            if (picked !== undefined) onSelect(picked);
          }}
        >
          {(state) => (
            <Row gap={4}>
              <Icon name="cast" size={13} stroke={1.8} color="accent" />
              <Text
                variant="meta"
                color="accent"
                lines={1}
                style={state.hovered ? UNDERLINE : undefined}
              >
                {playingOn}
              </Text>
            </Row>
          )}
        </Focusable>
      </Box>
    </>
  );
}

function TransportKeys({
  playing,
  send,
}: Readonly<{ playing: CastNowPlaying; send: Cast['send'] }>) {
  const t = useT();
  // Buffering is playing, stalled: the button a viewer needs is still Pause.
  const isPlaying = playing.state === 'playing' || playing.state === 'buffering';
  return (
    <Row gap={4}>
      <Transport
        icon="rewind-backward-10"
        label={t('player.back10')}
        onPress={() => void send({ type: 'skip', deltaMs: -SKIP_MS })}
      />
      <Transport
        icon={isPlaying ? 'player-pause-filled' : 'player-play-filled'}
        label={t(isPlaying ? 'player.pause' : 'player.play')}
        onPress={() => void send({ type: 'togglePlay' })}
        primary
      />
      <Transport
        icon="rewind-forward-10"
        label={t('player.fwd10')}
        onPress={() => void send({ type: 'skip', deltaMs: SKIP_MS })}
      />
      {playing.item.kind === 'episode' ? (
        <Transport
          icon="player-track-next"
          label={t('player.nextEpisode')}
          onPress={() => void send({ type: 'skipNext' })}
        />
      ) : null}
    </Row>
  );
}

function Scrubber({
  playing,
  positionMs,
  send,
}: Readonly<{ playing: CastNowPlaying; positionMs: number; send: Cast['send'] }>) {
  const t = useT();
  // While a drag is in flight the bar follows the finger: the receiver's
  // heartbeats would otherwise yank the handle back mid-gesture.
  const [dragMs, setDragMs] = useState<number | null>(null);
  const durationMs = playing.durationMs ?? 0;
  const shownMs = dragMs ?? positionMs;

  const commit = () => {
    if (dragMs == null) return;
    void send({ type: 'seek', positionMs: Math.round(dragMs) });
    setDragMs(null);
  };

  return (
    <>
      <Text variant="meta" color="textDim" shrink={0} style={TABULAR}>
        {formatTimecode(shownMs / 1000)}
      </Text>
      <input
        type="range"
        aria-label={t('player.seekBar')}
        min={0}
        max={Math.max(durationMs, 1)}
        value={Math.min(shownMs, durationMs || shownMs)}
        onChange={(e) => setDragMs(Number(e.target.value))}
        onPointerUp={() => commit()}
        onKeyUp={() => commit()}
        onBlur={() => commit()}
        style={{
          height: 4,
          minWidth: 0,
          flex: 1,
          cursor: 'pointer',
          accentColor: color('accent'),
        }}
      />
      <Text variant="meta" color="textDim" shrink={0} style={TABULAR}>
        {durationMs ? formatTimecode(durationMs / 1000) : '--:--'}
      </Text>
    </>
  );
}

const UNDERLINE = { textDecorationLine: 'underline' } as const;

const TABULAR = { fontVariant: ['tabular-nums' as const] };

function Transport({
  icon,
  label,
  onPress,
  primary,
}: Readonly<{ icon: IconName; label: string; onPress: () => void; primary?: boolean }>) {
  return (
    <IconButton
      variant={primary ? 'glass' : 'ghost'}
      size={primary ? 36 : 32}
      glyph={primary ? 20 : 18}
      icon={icon}
      label={label}
      onPress={onPress}
    />
  );
}
