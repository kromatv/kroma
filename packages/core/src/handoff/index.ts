// Nearby handoff, headless: the television's half, the telephone's half, and
// the port every way of finding a television answers through.

export type { HandoffBeaconHandle, HandoffBeaconView, HandoffLoopOptions } from './beacon';
export { startHandoff } from './beacon';
export type { FinalRefusal, GrantRefusal, GrantResult } from './grant';
export { checkRetryable, grantRefusal, HANDOFF_CHECK_LENGTH } from './grant';
export type { NearbyWatchOptions } from './nearby';
export { watchNearbyTvs } from './nearby';
export type {
  BeaconRecord,
  DiscoveredTv,
  LanBeacons,
  LanDiscoveryBridge,
  LanService,
  NearbyReceiver,
  TvDiscoverySource,
} from './sources';
export {
  beaconTxt,
  lanSource,
  parseBeaconTxt,
  safeLabel,
  serverSource,
  watchLanBeacons,
} from './sources';
