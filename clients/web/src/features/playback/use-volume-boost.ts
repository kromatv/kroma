import { useCallback, useState } from 'react';
import type { VideoPlayback } from '#web/features/playback/video-engine';

/** The loudest the web player goes: twice the element's own ceiling, through
 * a Web Audio gain behind the <video> (see the kit's useAudioFilter). */
export const VOLUME_BOOST_MAX = 2;

export interface VolumeBoost {
  /** The level the chrome shows and sets, [0, VOLUME_BOOST_MAX]. */
  volume: number;
  /** The gain past the element's ceiling, 1 while the level is at or under 100%. */
  boost: number;
  setVolume(level: number): void;
}

/** Splits one 0..200% level between the element (up to 1) and a gain node (the
 * rest). The element keeps owning everything under 100%, so the browser's own
 * volume state stays the source of truth there. */
export function useVolumeBoost(pb: Pick<VideoPlayback, 'volume' | 'setVol'>): VolumeBoost {
  const [boost, setBoost] = useState(1);
  const { setVol } = pb;

  const setVolume = useCallback(
    (level: number) => {
      const wanted = Math.max(0, Math.min(VOLUME_BOOST_MAX, level));
      setBoost(Math.max(1, wanted));
      setVol(Math.min(1, wanted));
    },
    [setVol],
  );

  return { volume: boost > 1 ? boost : pb.volume, boost, setVolume };
}
