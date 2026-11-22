/** The modules a server's guided setup offers, in the order it offers them.
 *  A module joins or leaves the offer here, with no server release. */
export const SETUP_OFFER = [
  'tv.kroma.mdns',
  'tv.kroma.remote',
  'tv.kroma.whisper',
  'tv.kroma.vector',
  'tv.kroma.acquisition',
] as const;
