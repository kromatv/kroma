import type { UpnpDevice } from '../discovery/upnp';
import type { Television } from '../television';
import { modules } from './registry';

export async function identify(
  host: string,
  openPorts: ReadonlySet<number>,
  upnp?: UpnpDevice,
): Promise<Television | null> {
  for (const module of modules()) {
    const television = await module.identify?.(host, openPorts, upnp);
    if (television) return television;
  }
  return null;
}
