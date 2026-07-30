import type { KromaClient, MediaItem } from '@kroma/client';
import { canDirectPlay, capabilities, type DirectPlayVerdict } from './hevc';

export interface AttachOptions {
  startMs?: number;
  autoplay?: boolean;
}

/**
 * Points a `<video>` at the server's range-streamed original file: no MSE, no
 * transcoding, the device decodes the source codec natively. Returns the verdict
 * so the caller can warn when the codec is unsupported.
 */
export function attachDirectPlay(
  video: HTMLVideoElement,
  client: KromaClient,
  item: MediaItem,
  opts: AttachOptions = {},
): DirectPlayVerdict {
  const verdict = canDirectPlay(item, capabilities());

  video.src = client.streamUrl(item.id);
  video.preload = 'auto';
  if (opts.startMs && opts.startMs > 0) {
    const seekTo = opts.startMs / 1000;
    const onLoaded = () => {
      try {
        video.currentTime = seekTo;
      } catch {
        /* ignore */
      }
      video.removeEventListener('loadedmetadata', onLoaded);
    };
    video.addEventListener('loadedmetadata', onLoaded);
  }
  if (opts.autoplay) {
    void video.play().catch(() => {
      /* autoplay may be blocked; caller can surface a Play button */
    });
  }
  return verdict;
}

/** Formats a runtime as `"2h08"` or `"47min"`. */
export function formatRuntime(durationMs: number | null | undefined): string {
  if (!durationMs || durationMs <= 0) return '';
  const totalMin = Math.round(durationMs / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}min`;
  return `${h}h${m.toString().padStart(2, '0')}`;
}
