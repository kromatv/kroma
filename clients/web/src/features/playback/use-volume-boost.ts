import { useCallback, useState } from 'react';
import type { VideoPlayback } from '#web/features/playback/video-engine';

/** The loudest the web player goes: twice the element's own ceiling, through
 * a Web Audio gain behind the <video> (see the kit's useAudioFilter). */
export const VOLUME_BOOST_MAX = 2;

// Human loudness is roughly logarithmic, so a level that reads linear on the
// rail has to reach the element as a power curve: gamma 3 puts 50% at an
// eighth of full amplitude, where a linear 0.5 would sound almost as loud as 1.
const VOLUME_GAMMA = 3;

/** The element amplitude [0,1] for a level [0,1] the viewer reads. */
export function amplitudeOf(level: number): number {
  return Math.max(0, Math.min(1, level)) ** VOLUME_GAMMA;
}

/** The level [0,1] the viewer reads for an element amplitude [0,1]. */
export function levelOf(amplitude: number): number {
  return Math.max(0, Math.min(1, amplitude)) ** (1 / VOLUME_GAMMA);
}

export interface VolumeBoost {
  /** The level the chrome shows and sets, [0, VOLUME_BOOST_MAX], linear to the
   * viewer: the loudness curve is applied on the way to the element. */
  volume: number;
  /** The gain past the element's ceiling, 1 while the level is at or under 100%. */
  boost: number;
  setVolume(level: number): void;
}

/** Splits one 0..200% level between the element (up to 1, through the loudness
 * curve) and a gain node (the rest, linear). The element keeps owning
 * everything under 100%, so the browser's own volume state stays the source of
 * truth there and is read back through the inverse curve. */
export function useVolumeBoost(pb: Pick<VideoPlayback, 'volume' | 'setVol'>): VolumeBoost {
  const [boost, setBoost] = useState(1);
  const { setVol } = pb;

  const setVolume = useCallback(
    (level: number) => {
      const wanted = Math.max(0, Math.min(VOLUME_BOOST_MAX, level));
      setBoost(Math.max(1, wanted));
      setVol(amplitudeOf(wanted));
    },
    [setVol],
  );

  return { volume: boost > 1 ? boost : levelOf(pb.volume), boost, setVolume };
}
