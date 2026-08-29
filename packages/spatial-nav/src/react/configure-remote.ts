import type { Direction } from '@kroma/spatial-nav';

type RemoteHandler = (direction: Direction) => void;
type Unsubscribe = () => void;

interface RemoteConfig {
  subscribe: (handle: RemoteHandler) => Unsubscribe;
}

const NOTHING_TO_STOP: Unsubscribe = () => undefined;

const transport: { subscribe: RemoteConfig['subscribe'] | null } = { subscribe: null };

/**
 * Names the transport every `<NavigatorRoot>` hears the remote through: one
 * process, one set of keys, however many navigators are mounted. Call it once
 * at startup, before the first root renders; a root that mounts first never
 * subscribes.
 */
function configureRemote({ subscribe }: RemoteConfig): void {
  transport.subscribe = subscribe;
}

function subscribeRemote(handle: RemoteHandler): Unsubscribe {
  return transport.subscribe?.(handle) ?? NOTHING_TO_STOP;
}

export type { RemoteConfig, RemoteHandler };
export { configureRemote, subscribeRemote };
