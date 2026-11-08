// A direct route to the server across the household's own network, proved
// before it is trusted and dropped when it stops answering.

export type { ConnectDirectOptions, DirectOutcome } from './connect-direct';
export { connectDirect } from './connect-direct';
export type {
  DirectConnection,
  DirectConnectionOptions,
  DirectState,
  LanPermission,
  Timers,
} from './direct-connection';
export { startDirectConnection } from './direct-connection';
export { isLanBase, isLanRoute } from './lan-base';
