// The cinematic brand intro, native (Apple TV / Android TV).
//
// The same film the browser shells play through @kroma/ui's <KromaIntro>, on the
// one player a native TV has: expo-video, which is AVPlayer on tvOS and
// Media3/ExoPlayer on Android TV. What is deliberately NOT ported is that
// component's pure-CSS fallback scene. It exists for browsers with no HEVC
// decoder, and a native television always has one, so a film that fails to open
// here simply hands off to the app instead of playing a second intro.
//
// An overlay, not a gate: the app tree is already mounted and fetching behind
// it, exactly as on the web. That is also why the intro HOLDS the remote for its
// lifetime (see holdInput): native has no capture phase, so without it the press
// that skips the film would also activate the card focused underneath, and the
// intro would fade out onto a screen nobody chose.
//
// See BrandIntro.web.tsx for the browser half.

import { colors, holdInput } from '@kroma/ui/kit';
import { EXIT_MS, SAFETY_SLACK_MS } from '@kroma/ui/kit/organisms/kroma-intro';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, type HWEvent, StyleSheet, useTVEventHandler, View } from 'react-native';

export interface BrandIntroProps {
  /** Shell-bundled override for the brand-intro film. */
  videoSrc?: string;
}

/** The bundled film: the 4K60 HEVC master, the same file the browser shells
 * carry. `require` rather than an import because Metro turns an asset into a
 * registry entry, and that entry is what expo-video takes as a source. */
const FILM: number = require('@kroma/ui/src/assets/kroma-intro-hevc.mp4');

/** Stall safety: how long the intro may hold the screen before handing off on
 * its own. Replaced by the film's real length as soon as the player reports one,
 * so this only ever covers a film that never becomes ready at all. */
const SAFETY_MS = 15_000;
/** Steps the film's sound is ramped down in while the picture fades out. */
const AUDIO_FADE_STEPS = 8;

/** Remote buttons that skip. The four directions are not among them: an arrow
 * during the intro is a hand finding the remote, not a request to navigate a
 * screen the user cannot see. */
const SKIP_EVENTS = new Set(['select', 'longSelect', 'playPause', 'play', 'pause', 'menu', 'back']);

/** The intro plays once per LAUNCH, not once per mount, so a re-render of the
 * root (or a fast refresh in dev) never replays it. The web half keeps the same
 * flag in sessionStorage; a native app has no such thing, and module scope
 * outlives every remount of the tree. */
let introSeen = false;

/** `useTVEventHandler` where the running React Native ships it (the tvOS fork),
 * a no-op hook where it does not. Bound at module scope so React never sees the
 * hook count change between builds. */
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

/** The film itself, mounted only while it plays: unmounting is what releases the
 * player, so the app behind it never shares a decoder with an intro that ended. */
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

  /**
   * End the intro: fade to black, then hand off to the app. Runs at most once,
   * whichever of the three ends it (the film's own end, a skip, the safety).
   *
   * The hand-off is a timer rather than the animation's completion callback, for
   * the same reason the web half uses one: an interrupted animation drops its
   * callback and would strand the app behind a black screen, and the one thing
   * an intro must never do is fail to end.
   */
  const exit = useCallback(() => {
    if (exited.current) return;
    exited.current = true;
    clearTimeout(safety.current);

    // The film keeps playing under the veil, as it does on the web. But its
    // sound has to leave with the picture, and a hardware player has no CSS to
    // fade, so the volume is ramped down across the same 850 ms.
    let step = 0;
    audioFade.current = setInterval(() => {
      step += 1;
      try {
        player.volume = Math.max(0, 1 - step / AUDIO_FADE_STEPS);
      } catch {
        // The player is already gone; there is nothing left to quieten.
      }
      if (step >= AUDIO_FADE_STEPS) clearInterval(audioFade.current);
    }, EXIT_MS / AUDIO_FADE_STEPS);

    Animated.timing(veil, { toValue: 1, duration: EXIT_MS, useNativeDriver: true }).start();
    handoff.current = setTimeout(() => onDoneRef.current(), EXIT_MS);
  }, [player, veil]);

  /** (Re-)arm the stall safety, from the film's real length once it has one. */
  const armSafety = useCallback(
    (durationSec?: number) => {
      clearTimeout(safety.current);
      const ms =
        durationSec && Number.isFinite(durationSec) && durationSec > 0
          ? durationSec * 1000 + SAFETY_SLACK_MS
          : SAFETY_MS;
      safety.current = setTimeout(exit, ms);
    },
    [exit],
  );

  // The film's own events. An error is not a fallback here (see the header): a
  // native TV that cannot open this file is a TV that gets the app straight away.
  useEffect(() => {
    const subscriptions = [
      player.addListener('playToEnd', exit),
      player.addListener('statusChange', ({ status, error }) => {
        if (status === 'error') {
          // Loud, because the failure is otherwise INVISIBLE: the app just
          // appears without an intro, which reads as "the port never shipped".
          // The usual cause is a stale build whose bundled assets predate the
          // film (`console.warn` reaches os_log; `console.log` does not).
          console.warn('[KROMA] brand intro could not play, skipping:', error?.message ?? status);
          exit();
        } else if (status === 'readyToPlay') armSafety(player.duration);
      }),
    ];
    return () => {
      for (const subscription of subscriptions) subscription.remove();
    };
  }, [player, exit, armSafety]);

  // Take the remote for the length of the intro, and arm the safety with the
  // fallback length until the player knows better.
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
    <View style={styles.stage}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        // The intro has no controls at all: it ends with the film, or on any
        // button. The platform's would sit on top of it and answer first.
        nativeControls={false}
        accessibilityLabel="KROMA"
      />
      <Animated.View pointerEvents="none" style={[styles.veil, { opacity: veil }]} />
    </View>
  );
}

/** The full-screen box, spelled out: this react-native copy's types have no
 * `absoluteFillObject` to spread. */
const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

const styles = StyleSheet.create({
  stage: { ...FILL, zIndex: 9999, backgroundColor: colors.bg },
  veil: { ...FILL, backgroundColor: colors.bg },
});
