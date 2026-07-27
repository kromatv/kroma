// "Playing on Salon": the docked remote, pinned to the bottom of the app shell
// while this browser is driving a TV.
//
// It shows what the TV last REPORTED, not what was last asked of it - the
// position included, interpolated between the receiver's heartbeats so the bar
// runs smoothly rather than stepping every ten seconds.
//
// The scrubber is a plain range input on purpose: it is the one control the OS
// already makes accessible (keyboard, screen reader, touch) and this bar is a
// remote, not a player - it has no frames of its own to preview.

import { formatTimecode } from '@kroma/core';
import { useCast, useT } from '@kroma/ui';
import { Icon, type IconName } from '@kroma/ui/kit';
import { useState } from 'react';
import { castPicker } from '#web/features/playback/cast/cast-picker';
import { kromaClient } from '#web/shared/lib/api';

/** ±10 s, the same jump the players use. */
const SKIP_MS = 10_000;

export function CastBar() {
  const t = useT();
  const { active, positionMs, send, select } = useCast();
  // While a drag is in flight the bar follows the FINGER, not the TV: the
  // receiver's heartbeats would otherwise yank the handle back mid-gesture.
  const [dragMs, setDragMs] = useState<number | null>(null);

  if (!active) return null;

  const playing = active.nowPlaying;
  const item = playing?.item;
  const title = item ? (item.metadata?.title ?? item.title) : t('cast.idle');
  const poster = item ? kromaClient().posterFor(item, 96) : null;
  const durationMs = playing?.durationMs ?? 0;
  const shownMs = dragMs ?? positionMs;
  const isPlaying = playing?.state === 'playing';

  return (
    <aside
      aria-label={t('cast.playingOn', { device: active.name })}
      className="fixed inset-x-0 bottom-0 z-40 border-border border-t bg-surface-1/95 backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5">
        {poster ? (
          <img src={poster} alt="" className="h-12 w-8 shrink-0 rounded object-cover" />
        ) : null}

        <div className="min-w-0 shrink-0 basis-48 max-sm:basis-28">
          <p className="truncate text-[13px] font-semibold text-text">{title}</p>
          <button
            type="button"
            onClick={async () => {
              const picked = await castPicker({ offerLocal: true });
              if (picked !== undefined) select(picked);
            }}
            className="flex items-center gap-1 text-[12px] text-accent hover:underline"
          >
            <Icon name="cast" size={13} stroke={1.8} color="accent" />
            <span className="truncate">{t('cast.playingOn', { device: active.name })}</span>
          </button>
        </div>

        {playing ? (
          <>
            <div className="flex items-center gap-1">
              <Transport
                icon="rewind-backward-10"
                label={t('player.back10')}
                onClick={() => void send({ type: 'skip', deltaMs: -SKIP_MS })}
              />
              <Transport
                icon={isPlaying ? 'player-pause-filled' : 'player-play-filled'}
                label={t(isPlaying ? 'player.pause' : 'player.play')}
                onClick={() => void send({ type: 'togglePlay' })}
                primary
              />
              <Transport
                icon="rewind-forward-10"
                label={t('player.fwd10')}
                onClick={() => void send({ type: 'skip', deltaMs: SKIP_MS })}
              />
              {item?.kind === 'episode' ? (
                <Transport
                  icon="player-track-next"
                  label={t('player.nextEpisode')}
                  onClick={() => void send({ type: 'skipNext' })}
                />
              ) : null}
            </div>

            <span className="shrink-0 text-[12px] text-dim tabular-nums max-sm:hidden">
              {formatTimecode(shownMs / 1000)}
            </span>
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
              className="h-1 min-w-0 flex-1 cursor-pointer accent-accent max-sm:hidden"
            />
            <span className="shrink-0 text-[12px] text-dim tabular-nums max-sm:hidden">
              {durationMs ? formatTimecode(durationMs / 1000) : '--:--'}
            </span>
          </>
        ) : (
          <span className="flex-1 text-[12px] text-dim">{t('cast.idle')}</span>
        )}

        <Transport
          icon="player-stop-filled"
          label={t('cast.stop')}
          onClick={() => {
            void send({ type: 'stop' });
            select(null);
          }}
        />
      </div>
    </aside>
  );

  /** Send the dragged position, then hand the bar back to the TV's own beats. */
  function commit() {
    if (dragMs == null) return;
    void send({ type: 'seek', positionMs: Math.round(dragMs) });
    setDragMs(null);
  }
}

function Transport({
  icon,
  label,
  onClick,
  primary,
}: Readonly<{ icon: IconName; label: string; onClick: () => void; primary?: boolean }>) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid place-items-center rounded-full transition-colors ${
        primary ? 'h-9 w-9 bg-white/10 hover:bg-white/16' : 'h-8 w-8 hover:bg-white/8'
      }`}
    >
      <Icon name={icon} size={primary ? 20 : 18} stroke={1.8} />
    </button>
  );
}
