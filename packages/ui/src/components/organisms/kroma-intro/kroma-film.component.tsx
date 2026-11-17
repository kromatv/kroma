import { type CSSProperties, type RefObject, useEffect, useRef, useState } from 'react';
import { color as tokenColor } from '#ui/core/color';
import { PINNED, VIDEO_SOURCES } from './constants';
import { IntroShell } from './intro-shell.component';
import { type FilmPlayback, useFilmPlayback } from './use-film-playback.hook';
import { useIntroExit } from './use-intro-exit.hook';

/**
 * KROMA's brand film, full-screen with sound, shared by every client: the 4K60
 * HEVC master, or its H.264 encode where the engine has no HEVC decoder, picked
 * by the `<video>` element from its own sources. When neither can play (no
 * decoder, a decode error, autoplay refused even muted), the intro hands off to
 * the app at once.
 *
 * Browsers block autoplay-with-sound until a user gesture, so playback tries
 * with sound first and falls back to muted; the first pointer/key interaction
 * unmutes in place. Any key or remote button skips; a safety timer, armed from
 * the video's own duration, guarantees the intro ends even if playback stalls.
 *
 * Framework-free (plain inline styles) so it renders identically on the web
 * SSR shell and on old TV webviews. Mount as a full-screen overlay; `onDone`
 * hands off to the app.
 */
export interface KromaIntroProps {
  /** Called once the intro has finished (video ended or skipped). */
  onDone: () => void;
  /** Single-source override for the intro film. Defaults to the bundled film:
   * HEVC where the engine decodes it, else H.264. */
  videoSrc?: string;
  /** Loop forever instead of ending (preview/idle-screen use). */
  loop?: boolean;
  /** Optional tagline overlaid during the film's final seconds. None by default:
   * the film ends on the bare lockup. */
  tagline?: string;
}

interface FilmSource {
  src: string;
  type?: string;
}

// Solid #0A0A0C: without a poster, Android TV's WebView flashes its own
// light placeholder (a panel with a play glyph) for a few frames before an
// un-started <video> decodes.
const POSTER =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR42mPg4uIBIgYIBQADhgCBD73RIwAAAABJRU5ErkJggg==';

const TAGLINE_LEAD_S = 2.6;

function filmSources(videoSrc: string | undefined): readonly FilmSource[] {
  const sources: readonly FilmSource[] =
    videoSrc === undefined ? VIDEO_SOURCES : [{ src: videoSrc }];
  return sources.filter((s) => s.src !== '');
}

function useTaglineCue(video: RefObject<HTMLVideoElement | null>, tagline?: string): boolean {
  const [cued, setCued] = useState(false);
  useEffect(() => {
    const v = video.current;
    if (!v || !tagline) {
      return undefined;
    }
    const onTime = () => setCued(v.currentTime > v.duration - TAGLINE_LEAD_S);
    v.addEventListener('timeupdate', onTime);
    return () => v.removeEventListener('timeupdate', onTime);
  }, [video, tagline]);
  return cued;
}

function Tagline({ text }: Readonly<{ text: string }>) {
  return (
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
        color: tokenColor('text/52'),
        whiteSpace: 'nowrap',
        animation: 'kroma-tagIn .85s ease both',
        pointerEvents: 'none',
      }}
    >
      {text}
    </div>
  );
}

const VIDEO_STYLE: CSSProperties = {
  position: 'absolute',
  ...PINNED,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  background: tokenColor('bg'),
};

interface FilmVideoProps {
  video: RefObject<HTMLVideoElement | null>;
  sources: readonly FilmSource[];
  film: FilmPlayback;
  onFail: () => void;
}

function FilmVideo({ video, sources, film, onFail }: Readonly<FilmVideoProps>) {
  const last = sources.length - 1;
  return (
    // oxlint-disable-next-line jsx-a11y/media-has-caption -- decorative brand film with a musical sting only, no speech to caption; the shell carries the accessible name.
    <video
      ref={video}
      playsInline
      preload="metadata"
      poster={POSTER}
      style={VIDEO_STYLE}
      onEnded={film.ended}
      onLoadedMetadata={film.rearm}
      onError={(e) => {
        if (e.target === e.currentTarget) {
          onFail();
        }
      }}
    >
      {sources.map((s, i) => (
        <source key={s.src} src={s.src} type={s.type} onError={i === last ? onFail : undefined} />
      ))}
    </video>
  );
}

export function KromaFilm({ onDone, videoSrc, loop = false, tagline }: Readonly<KromaIntroProps>) {
  const video = useRef<HTMLVideoElement | null>(null);
  const intro = useIntroExit(onDone);
  const sources = filmSources(videoSrc);
  const film = useFilmPlayback({ video, intro, loop, playable: sources.length > 0 });
  const cued = useTaglineCue(video, tagline);

  return (
    <IntroShell exiting={intro.exiting}>
      <FilmVideo video={video} sources={sources} film={film} onFail={intro.handOff} />
      {tagline && cued ? <Tagline text={tagline} /> : null}
    </IntroShell>
  );
}
