// Browser shells ship no native VLC view. Metro selects the native adapter.
import { vlcBackendFor } from './vlcBackend';

export type { VlcPlaneProps, VlcPlaneStats } from './vlcBackend';
export { VLC_CACHE_MS } from './vlcBackend';
export const { getVlcPlane, vlcAvailable, releaseVlcPlanes } = vlcBackendFor(null);
