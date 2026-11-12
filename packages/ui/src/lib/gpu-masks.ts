import { Platform } from 'react-native';

const GPU_MASK_PLATFORMS: ReadonlySet<string> = new Set(['ios', 'tizen', 'webos']);

/**
 * Whether a masked view draws its mask on the GPU here, so a page can mask what
 * scrolls inside it: tvOS, Tizen and webOS do, while Android would redraw the
 * whole page through a bitmap.
 */
export const GPU_MASKS = GPU_MASK_PLATFORMS.has(Platform.OS);
