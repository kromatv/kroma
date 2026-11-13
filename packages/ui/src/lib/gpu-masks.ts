import { Platform } from 'react-native';

const GPU_MASK_PLATFORMS: ReadonlySet<string> = new Set(['ios', 'tizen', 'webos']);

/**
 * Whether a masked view draws its mask on the GPU here, so a page can mask what
 * scrolls inside it: tvOS, Tizen and webOS do, while Android would redraw the
 * whole page through a bitmap.
 */
export const GPU_MASKS = GPU_MASK_PLATFORMS.has(Platform.OS);

const COSTLY_PAGE_MASK_PLATFORMS: ReadonlySet<string> = new Set(['tizen']);

/**
 * Whether a mask the size of a page is affordable here. Tizen draws with Evas,
 * which redraws every rounded clip under a mask into a surface of its own on
 * each frame the page moves: there a page fades under a cover or a band, and
 * masks stay for what is small.
 */
export const PAGE_MASKS = GPU_MASKS && !COSTLY_PAGE_MASK_PLATFORMS.has(Platform.OS);
