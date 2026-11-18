import type { MediaItem } from '@kromatv/client/media';
import { beyondDecoder, type PlaybackCapabilities } from '@kromatv/core';
import { useCallback, useState } from 'react';
import type { EnginePref } from '#tv/app/engine-pref';
import { vlcAvailable } from '#tv/features/playback/player/vlc-plane';

interface VlcFallback {
  active: boolean;
  take: () => boolean;
  clear: () => void;
}

/**
 * The last resort under `auto`: a title the platform player cannot decode goes to
 * the engine that carries its own decoders. Held as the item it applies to, so a
 * new title resets it by construction and one bad file cannot pin the session.
 * Only from `auto`, and only once: an explicit choice is the viewer's, and a VLC
 * failure has nowhere left to fall. A picture over this device's decoder ceiling
 * never goes there either: the server's master is the one route that can shrink
 * it, and VLC would answer the frame the hardware refused with its own software
 * decoder, which on a set that HAS a ceiling is a slideshow rather than a film.
 * `take` hands the title to VLC, or answers `false` where VLC is not the next step.
 */
export function useVlcFallback(
  item: MediaItem,
  enginePref: EnginePref,
  capabilities?: PlaybackCapabilities,
): VlcFallback {
  const [fallbackFor, setFallbackFor] = useState<string | null>(null);
  const active = fallbackFor === item.id;
  const overrun = beyondDecoder(item, capabilities) !== null;
  const take = (): boolean => {
    if (overrun || enginePref !== 'auto' || active || !vlcAvailable()) {
      return false;
    }
    setFallbackFor(item.id);
    return true;
  };
  const clear = useCallback(() => setFallbackFor(null), []);
  return { active, take, clear };
}
