import type { createFocusProbe } from './focus-here';
import type { createFocusMirror } from './focus-mirror';
export interface RemoteTransportOptions {
  enabled: boolean;
  probe: ReturnType<typeof createFocusProbe>;
  mirror: ReturnType<typeof createFocusMirror>;
}
