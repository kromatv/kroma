import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { SAFETY_MS, SAFETY_SLACK_MS, VIDEO_SOURCES } from './constants';
import { CssIntro } from './css-intro';
import { IntroShell } from './intro-shell';
import { useIntroExit } from './use-intro-exit';
import { useIntroKeys } from './use-intro-keys';

/**
 * KROMA cinematic brand intro: the bundled 4K60 HEVC film, full-screen with
 * sound, shared by every client. Anything without an HEVC decoder falls back
 * to the pure-CSS scene in {@link CssIntro}.
 *
 * Browsers block autoplay-with-sound until a user gesture, so playback tries
 * with sound first and falls back to muted; the first pointer/key interaction
 * unmutes in place, rewinding only if the film has barely started (so an
 * early gesture gets picture and sound together, while a late one can't
 * restart the intro). Any key or remote button skips; a safety timer, armed
 * from the video's own duration, guarantees the intro ends even if playback
 * stalls.
 *
 * Framework-free (plain inline styles) so it renders identically on the web
 * SSR shell and on old TV webviews. Mount as a full-screen overlay; `onDone`
 * hands off to the app.
 */
export interface KromaIntroProps {
  /** Called once the intro has finished (video ended or skipped). */
  onDone: () => void;
  /** Single-source override for the intro film. Defaults to the bundled
   * 4K60 HEVC film. */
  videoSrc?: string;
  /** Loop forever instead of ending (preview/idle-screen use). */
  loop?: boolean;
  /** Optional tagline overlaid during the film's final seconds. None by default:
   * the film ends on the bare lockup. */
  tagline?: string;
  /** Performance mode for weak TV GPUs. The video path decodes in hardware and
   * ignores it; the CSS fallback uses it to stay compositor-only. */
  lite?: boolean;
}

// Solid #0A0A0C: without a poster, Android TV's WebView flashes its own
// light placeholder (a panel with a play glyph) for a few frames before an
// un-started <video> decodes.
const POSTER =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR42mPg4uIBIgYIBQADhgCBD73RIwAAAABJRU5ErkJggg==';

// Module-level so the recheck can re-arm itself: an effect event may not call
// itself from its own body. A hidden tab defers the media fetch entirely, so
// instead of burning the intro while parked in the background, the timer
// re-checks once per safety window.
function armStallSafety(opts: {
  video: { current: HTMLVideoElement | null };
  arm: (ms: number, run: () => void) => void;
  exit: () => void;
  looping: () => boolean;
}): void {
  if (opts.looping()) return;
  const d = opts.video.current?.duration;
  const ms = d && Number.isFinite(d) && d > 0 ? d * 1000 + SAFETY_SLACK_MS : SAFETY_MS;
  opts.arm(ms, () => {
    const v = opts.video.current;
    if (document.hidden && v?.readyState === 0) armStallSafety(opts);
    else opts.exit();
  });
}

const TAGLINE_LEAD_S = 2.6;
// Long enough that a slow network still reads as loading rather than
// sourceless; short enough that the fallback still opens with the sting.
const NO_SOURCE_MS = 500;
// Past this point in the film, a first gesture only unmutes rather than
// rewinding to the top.
const UNMUTE_REWIND_S = 0.4;

export function KromaIntro(props: Readonly<KromaIntroProps>) {
  const [videoFailed, setVideoFailed] = useState(false);
  if (videoFailed) {
    const { onDone, loop, tagline, lite } = props;
    return <CssIntro onDone={onDone} loop={loop} tagline={tagline} lite={lite} />;
  }
  return <VideoIntro {...props} onVideoError={() => setVideoFailed(true)} />;
}

function VideoIntro({
  onDone,
  videoSrc,
  loop = false,
  tagline,
  onVideoError,
}: Readonly<KromaIntroProps & { onVideoError: () => void }>) {
  const [tagVisible, setTagVisible] = useState(false);
  const { exiting, exitedRef, armSafety, disarmSafety, exit, reopen, clearTimers } =
    useIntroExit(onDone);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  // (Re-)arm the stall-safety timer from the film's real length when known.
  const isLooping = useEffectEvent(() => loop);
  const rearmSafety = useEffectEvent(() => {
    if (loop) {
      disarmSafety();
      return;
    }
    armStallSafety({ video: videoRef, arm: armSafety, exit, looping: isLooping });
  });

  // A failure landing after the user skipped is ignored: swapping in the CSS
  // scene would unmount us, and the mount effect's cleanup would drop the
  // pending hand-off, so the fallback would play a whole second intro from
  // the top.
  const fail = useEffectEvent(() => {
    if (!exitedRef.current) onVideoError();
  });

  const replay = useEffectEvent(() => {
    const v = videoRef.current;
    if (!v) return;
    reopen();
    setTagVisible(false);
    try {
      v.currentTime = 0;
    } catch {
      /* not yet seekable harmless */
    }
    void v.play().catch(() => undefined);
    rearmSafety();
  });

  // First gesture while the film is muted: add sound in place. Chrome keeps the
  // whole film muted until then, so a rewind here would restart the intro on any
  // click or non-skip remote key; only a gesture at the very top rewinds, which
  // is what makes picture and sound open together when the user is early.
  const unblock = useEffectEvent(() => {
    const v = videoRef.current;
    if (!v?.muted || exitedRef.current) return;
    v.muted = false;
    if (v.currentTime >= UNMUTE_REWIND_S) return;
    try {
      v.currentTime = 0;
    } catch {
      /* harmless */
    }
    void v.play().catch(() => undefined);
    rearmSafety();
  });

  const onEnded = useEffectEvent(() => {
    if (loop) replay();
    else exit();
  });

  useIntroKeys({ exit, replay, unblock });

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only intro timeline; exit/clearTimers are stable useCallbacks and the rest are effect events, all intentionally omitted so the effect never re-arms (which would restart the film) on unrelated re-renders.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    // Sound-first autoplay; muted fallback when the browser blocks it. A
    // muted-too rejection means playback is genuinely broken: use the CSS scene.
    const begin = () => {
      const p = v.play();
      if (typeof p?.then === 'function') {
        p.catch(() => {
          v.muted = true;
          const p2 = v.play();
          if (typeof p2?.then === 'function') p2.catch(fail);
        });
      }
      rearmSafety();
    };

    // Chrome defers media loading in background tabs, which would stall the film
    // until the safety timer silently burned the once-per-session intro. If the
    // page opens hidden, hold everything until it first becomes visible.
    let pendingVisible = false;
    const onVisible = () => {
      if (pendingVisible && !document.hidden) {
        pendingVisible = false;
        document.removeEventListener('visibilitychange', onVisible);
        begin();
      }
    };
    if (document.hidden) {
      pendingVisible = true;
      document.addEventListener('visibilitychange', onVisible);
    } else {
      begin();
    }

    // A browser with no decoder for the film - Firefox, software-only Chrome,
    // and any target this HEVC-only master does not reach - never fires `error`
    // and never rejects `play()`. The resource selection algorithm simply
    // exhausts every <source>, parks the element in NETWORK_NO_SOURCE and stops,
    // leaving the promise pending for good. Waiting for an event that cannot
    // come is how the CSS scene stopped being reachable: what the viewer got
    // instead was five seconds of black, and then the app.
    //
    // So the sourceless case is asked about rather than waited for.
    const sourceless = setTimeout(() => {
      if (v.networkState === v.NETWORK_NO_SOURCE && v.readyState === v.HAVE_NOTHING) fail();
    }, NO_SOURCE_MS);

    const onMeta = () => rearmSafety();
    v.addEventListener('ended', onEnded);
    v.addEventListener('loadedmetadata', onMeta);
    v.addEventListener('error', fail);

    return () => {
      clearTimers();
      clearTimeout(sourceless);
      document.removeEventListener('visibilitychange', onVisible);
      v.pause();
      v.removeEventListener('ended', onEnded);
      v.removeEventListener('loadedmetadata', onMeta);
      v.removeEventListener('error', fail);
    };
  }, []);

  // The tagline reveal is the film's only per-frame listener: wire it up only
  // when a tagline was actually asked for (no shell sets one today).
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !tagline) return;
    const onTime = () => {
      if (v.duration && Number.isFinite(v.duration) && v.currentTime > v.duration - TAGLINE_LEAD_S)
        setTagVisible(true);
    };
    v.addEventListener('timeupdate', onTime);
    return () => v.removeEventListener('timeupdate', onTime);
  }, [tagline]);

  return (
    <IntroShell exiting={exiting}>
      {/* biome-ignore lint/a11y/useMediaCaption: decorative brand film with a musical sting only, no speech to caption; the shell carries the accessible name. */}
      <video
        ref={videoRef}
        playsInline
        preload="metadata"
        poster={POSTER}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          background: '#0A0A0C',
        }}
      >
        {/* With no playable source (no HEVC decoder), play() rejects
            (NotSupportedError) on both attempts above and the CSS scene takes
            over. */}
        {videoSrc ? (
          <source src={videoSrc} />
        ) : (
          VIDEO_SOURCES.map((s) => <source key={s.src} src={s.src} type={s.type} />)
        )}
      </video>

      {/* tagline overlay during the film's landing */}
      {tagline && tagVisible ? (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: '11%',
            textAlign: 'center',
            fontWeight: 700,
            fontSize: '1.8vmin',
            letterSpacing: '.42em',
            textTransform: 'uppercase',
            color: 'rgba(244,243,240,.52)',
            whiteSpace: 'nowrap',
            animation: 'kroma-tagIn .85s ease both',
            pointerEvents: 'none',
          }}
        >
          {tagline}
        </div>
      ) : null}
    </IntroShell>
  );
}
