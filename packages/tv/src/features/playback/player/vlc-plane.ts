// Browser shells ship no native VLC view. Metro selects the native adapter.
import { vlcBackendFor } from './vlc-backend';

export type { VlcPlaneProps, VlcPlaneStats } from './vlc-backend';
export { VLC_CACHE_MS } from './vlc-backend';
export const { getVlcPlane, vlcAvailable, releaseVlcPlanes } = vlcBackendFor(null);
