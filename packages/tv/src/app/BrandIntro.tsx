// Native (Apple TV / Android TV) brand intro, played via expo-video. No CSS
// fallback: unlike the browser shells, a native TV always has an HEVC decoder.

import { holdInput, styles } from '@kroma/ui/kit';
import { EXIT_MS, SAFETY_SLACK_MS } from '@kroma/ui/kit/organisms/kroma-intro';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, type HWEvent, StyleSheet, useTVEventHandler, View } from 'react-native';

export interface BrandIntroProps {
  videoSrc?: string;
}

// `require`, not an import: Metro turns the asset into a registry entry, which
// is what expo-video expects as a source.
const FILM: number = require('@kroma/ui/src/assets/kroma-intro-hevc.mp4');

const FALLBACK_HOLD_MS = 15_000;
const AUDIO_FADE_STEPS = 8;

// Arrow keys are deliberately excluded: during the intro they are a hand
// finding the remote, not a request to navigate a screen it can't see.
const SKIP_EVENTS = new Set(['select', 'longSelect', 'playPause', 'play', 'pause', 'menu', 'back']);

// Module scope so the intro plays once per launch, not once per mount (a fast
// refresh must not replay it), and outlives every remount.
let introSeen = false;

// `useTVEventHandler` exists only on the tvOS RN fork; bound once at module
// scope so the hook count never changes between builds.
const HAS_TV_EVENTS = typeof useTVEventHandler === 'function';
const useRemoteEvents: (handler: (event: HWEvent) => void) => void = HAS_TV_EVENTS
  ? useTVEventHandler
  : () => {};

export function BrandIntro({ videoSrc }: Readonly<BrandIntroProps>) {
  const [done, setDone] = useState(introSeen);
  const finish = useCallback(() => {
    introSeen = true;
    setDone(true);
  }, []);
  if (done) return null;
  return <IntroFilm source={videoSrc ?? FILM} onDone={finish} />;
}

// Mounted only while it plays: unmounting is what releases the player, so the
// app behind it never shares a decoder with an intro that ended.
function IntroFilm({ source, onDone }: Readonly<{ source: string | number; onDone: () => void }>) {
  const player = useVideoPlayer(source, (p) => {
    p.loop = false;
    p.muted = false;
    p.play();
  });

  const veil = useRef(new Animated.Value(0)).current;
  const exited = useRef(false);
  const safety = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handoff = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const audioFade = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  // Read through a ref so the effects below never have to re-run (which would
  // restart the film) when the prop identity changes.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // The hand-off runs on a timer, not the animation's completion callback: an
  // interrupted animation drops its callback, which would strand the app
  // behind a black screen.
  const exit = useCallback(() => {
    if (exited.current) return;
    exited.current = true;
    clearTimeout(safety.current);

    // A hardware player has no CSS to fade, so volume is ramped manually
    // alongside the veil animation.
    let step = 0;
    audioFade.current = setInterval(() => {
      step += 1;
      try {
        player.volume = Math.max(0, 1 - step / AUDIO_FADE_STEPS);
      } catch {
        // player already gone
      }
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

  // A native TV that cannot open this file gets the app straight away rather
  // than a stuck intro.
  useEffect(() => {
    const subscriptions = [
      player.addListener('playToEnd', exit),
      player.addListener('statusChange', ({ status, error }) => {
        if (status === 'error') {
          // console.warn, not console.log: only the former reaches os_log, and
          // a silent failure here just looks like a missing intro.
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
  }, [armSafety]);

  useRemoteEvents((event: HWEvent) => {
    // No key-up filter: Android reports a press twice and `exit` is single-shot,
    // so the second half is already a no-op.
    if (SKIP_EVENTS.has(event.eventType)) exit();
  });

  return (
    // Not `box-none`: a touch on the intro belongs to the intro, and would
    // otherwise land on the app underneath.
    <View style={s.stage}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        // The intro has no controls at all: it ends with the film, or on any
        // button. The platform's would sit on top of it and answer first.
        nativeControls={false}
        accessibilityLabel="KROMA"
      />
      <Animated.View pointerEvents="none" style={[s.veil, { opacity: veil }]} />
    </View>
  );
}

const s = styles({
  stage: { fill: true, z: 9999, bg: 'bg' },
  veil: { fill: true, bg: 'bg' },
});
