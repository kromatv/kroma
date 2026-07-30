// The web player's manual engine override, persisted per device. `auto` lets
// `selectEngine` decide (direct-play when it can, else the HLS master through
// Shaka Player by default); `direct` forces the bare `<video src>`; `remux`
// forces the master through hls.js instead of Shaka; `shaka` forces the master
// through Shaka even for a direct-play-able file.

export type WebEnginePref = 'auto' | 'direct' | 'remux' | 'shaka';

const KEY = 'kroma:web-engine';
const ALL: readonly WebEnginePref[] = ['auto', 'direct', 'remux', 'shaka'];

/** The saved engine preference for this device, or `auto`. */
export function getWebEnginePref(): WebEnginePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v && (ALL as readonly string[]).includes(v)) return v as WebEnginePref;
  } catch {
    /* storage unavailable */
  }
  return 'auto';
}

export function setWebEnginePref(p: WebEnginePref): void {
  try {
    localStorage.setItem(KEY, p);
  } catch {
    /* storage unavailable */
  }
}
