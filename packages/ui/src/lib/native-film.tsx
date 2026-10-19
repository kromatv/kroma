import { styles, useStyles } from '#ui/core/styles';
import { useInputGate } from '#ui/lib/input-gate';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, type HWEvent, StyleSheet, useTVEventHandler, View } from 'react-native';
import { EXIT_MS, SAFETY_SLACK_MS } from '#ui/lib/intro-timing';

/** What `<NativeFilm>` takes. */
export interface NativeFilmProps {
  videoSrc?: string;
  onDone: () => void;
}

const FILM: number = require('../assets/kroma-intro-hevc-1080.mp4');

const FALLBACK_HOLD_MS = 15_000;
const AUDIO_FADE_STEPS = 8;

const SKIP_EVENTS = new Set(['select', 'longSelect', 'playPause', 'play', 'pause', 'menu', 'back']);

const HAS_TV_EVENTS = typeof useTVEventHandler === 'function';
const useRemoteEvents: (handler: (event: HWEvent) => void) => void = HAS_TV_EVENTS
  ? useTVEventHandler
  : () => {};

/** The brand film over the app through the native video player; renders nothing in a browser, where `KromaIntro` plays it. */
export function NativeFilm({ videoSrc, onDone }: Readonly<NativeFilmProps>) {
  const source = videoSrc ?? FILM;
  const s = useStyles(sDefinition);

  const { holdInput } = useInputGate();
  const player = useVideoPlayer(source, (p) => {
    p.loop = false;
    p.muted = false;
    p.play();
  });

  const [veil] = useState(() => new Animated.Value(0));
  const exited = useRef(false);
  const safety = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handoff = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const audioFade = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  const exit = useCallback(() => {
    if (exited.current) return;
    exited.current = true;
    clearTimeout(safety.current);

    let step = 0;
    audioFade.current = setInterval(() => {
      step += 1;
      try {
        player.volume = Math.max(0, 1 - step / AUDIO_FADE_STEPS);
      } catch {}
      if (step >= AUDIO_FADE_STEPS) clearInterval(audioFade.current);
    }, EXIT_MS / AUDIO_FADE_STEPS);

    Animated.timing(veil, { toValue: 1, duration: EXIT_MS, useNativeDriver: true }).start();
    handoff.current = setTimeout(() => onDoneRef.current(), EXIT_MS);
  }, [player, veil]);

  const armSafety = useCallback(
    (durationSec?: number) => {
      clearTimeout(safety.current);
      const ms =
        durationSec && Number.isFinite(durationSec) && durationSec > 0
          ? durationSec * 1000 + SAFETY_SLACK_MS
          : FALLBACK_HOLD_MS;
      safety.current = setTimeout(exit, ms);
    },
    [exit],
  );

  useEffect(() => {
    const subscriptions = [
      player.addListener('playToEnd', exit),
      player.addListener('statusChange', ({ status, error }) => {
        if (status === 'error') {
          console.warn('[KROMA] brand intro could not play, skipping:', error?.message ?? status);
          exit();
        } else if (status === 'readyToPlay') armSafety(player.duration);
      }),
    ];
    return () => {
      for (const subscription of subscriptions) subscription.remove();
    };
  }, [player, exit, armSafety]);

  useEffect(() => {
    armSafety();
    const release = holdInput();
    return () => {
      release();
      clearTimeout(safety.current);
      clearTimeout(handoff.current);
      clearInterval(audioFade.current);
    };
  }, [armSafety, holdInput]);

  useRemoteEvents((event: HWEvent) => {
    if (SKIP_EVENTS.has(event.eventType)) exit();
  });

  return (
    <View style={s.stage}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
        accessibilityLabel="KROMA"
      />
      <Animated.View style={[s.veil, { opacity: veil }]} />
    </View>
  );
}

const sDefinition = styles({
  stage: { fill: true, z: 9999, bg: 'bg' },
  veil: { fill: true, bg: 'bg', pointerEvents: 'none' },
});
