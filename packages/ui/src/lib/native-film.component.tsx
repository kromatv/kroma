import { styles, useStyles } from '#ui/core/styles';
import { useInputGate } from '#ui/lib/input-gate';
import {
  type SourceLoadEventPayload,
  useVideoPlayer,
  type VideoPlayer,
  VideoView,
} from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  type HWEvent,
  StyleSheet,
  useTVEventHandler,
  View,
} from 'react-native';
import { type FilmExit, useFilmExit } from '#ui/lib/native-film-exit.hook';

/** What `<NativeFilm>` takes. */
export interface NativeFilmProps {
  /** Played instead of the landscape film when the window is taller than wide as
   *  the film starts: a bundled asset (`require`) or a URL. */
  portraitSrc?: number | string;
  onDone: () => void;
}

type Film = number | string;

const FILMS: readonly Film[] = [
  require('../assets/kroma-intro-hevc-1080.mp4'),
  require('../assets/kroma-intro-h264.mp4'),
];

function pickFilms(portraitSrc?: Film): readonly Film[] {
  const { width, height } = Dimensions.get('window');
  return portraitSrc !== undefined && height > width ? [portraitSrc] : FILMS;
}

function decodable({ availableVideoTracks }: SourceLoadEventPayload): boolean {
  return availableVideoTracks.length === 0 || availableVideoTracks.some((t) => t.isSupported);
}

const SKIP_EVENTS = new Set(['select', 'longSelect', 'playPause', 'play', 'pause', 'menu', 'back']);

const HAS_TV_EVENTS = typeof useTVEventHandler === 'function';
const useRemoteEvents: (handler: (event: HWEvent) => void) => void = HAS_TV_EVENTS
  ? useTVEventHandler
  : () => {};

function useSkipEvents(exit: () => void): void {
  useRemoteEvents((event: HWEvent) => {
    if (SKIP_EVENTS.has(event.eventType)) {
      exit();
    }
  });
}

function useFilmFallback(player: VideoPlayer, films: readonly Film[], handOff: () => void) {
  const state = useRef({ next: 1, switching: false });

  const advance = useCallback(() => {
    const film = films[state.current.next];
    state.current.next += 1;
    if (film === undefined) {
      handOff();
      return;
    }
    state.current.switching = true;
    player.replaceAsync(film).then(() => player.play(), handOff);
  }, [player, films, handOff]);

  const loaded = useCallback(
    (payload: SourceLoadEventPayload) => {
      state.current.switching = false;
      if (!decodable(payload)) {
        advance();
      }
    },
    [advance],
  );

  const failed = useCallback(() => {
    if (!state.current.switching) {
      advance();
    }
  }, [advance]);

  return { loaded, failed };
}

function useFilmEvents(player: VideoPlayer, films: readonly Film[], end: FilmExit): void {
  const { exit, handOff, armSafety } = end;
  const { loaded, failed } = useFilmFallback(player, films, handOff);

  useEffect(() => {
    const subscriptions = [
      player.addListener('playToEnd', exit),
      player.addListener('sourceLoad', loaded),
      player.addListener('statusChange', ({ status, error }) => {
        if (status === 'error') {
          console.warn('[KROMA] brand intro could not play this film:', error?.message ?? status);
          failed();
        } else if (status === 'readyToPlay') {
          armSafety(player.duration);
        }
      }),
    ];
    return () => {
      for (const subscription of subscriptions) {
        subscription.remove();
      }
    };
  }, [player, exit, loaded, failed, armSafety]);
}

/**
 * The brand film over the app through the native video player; renders nothing
 * in a browser, where `KromaIntro` plays it. The H.264 encode follows the HEVC
 * film when the device cannot decode it, and the app opens at once when neither
 * plays.
 */
export function NativeFilm({ portraitSrc, onDone }: Readonly<NativeFilmProps>) {
  const [films] = useState(() => pickFilms(portraitSrc));
  const s = useStyles(sDefinition);
  const { holdInput } = useInputGate();
  const player = useVideoPlayer(films[0] ?? null, (p) => {
    p.loop = false;
    p.muted = false;
    p.play();
  });
  const end = useFilmExit(player, onDone);
  const { exit, armSafety } = end;
  useFilmEvents(player, films, end);
  useSkipEvents(exit);

  useEffect(() => {
    armSafety();
    return holdInput();
  }, [armSafety, holdInput]);

  return (
    <View style={s.stage} onStartShouldSetResponder={() => true} onResponderRelease={exit}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
        accessibilityLabel="KROMA"
      />
      <Animated.View style={[s.veil, { opacity: end.veil }]} />
    </View>
  );
}

const sDefinition = styles({
  stage: { fill: true, z: 9999, bg: 'bg' },
  veil: { fill: true, bg: 'bg', pointerEvents: 'none' },
});
