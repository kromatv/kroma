// Hands @kroma/tv the libVLC plane, which only this shell builds.
//
// The engine exists for what the platform decoder refuses: Media3 falls back to
// nothing, because its FFmpeg video renderer answers FORMAT_UNSUPPORTED for every
// format and returns a null decoder, so a file the chip will not take (HEVC
// Main10 on an 8-bit decoder, VC-1, MPEG-2) has no second chance. VLC carries its
// own decoders.
//
// Apple builds no module, `VlcPlayerView` is null and nothing is registered -
// the correct answer there, and what keeps the engine out of that picker.

import { registerVlcPlane, type VlcPlaneProps } from '@kroma/tv';
import type { ComponentType } from 'react';
import { VlcPlayerView } from '../../modules/vlc-player';

export function installVlcPlane(): void {
  registerVlcPlane(VlcPlayerView as ComponentType<VlcPlaneProps> | null);
}
