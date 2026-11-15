import type { MdnsService } from '../discovery/mdns';
import type { UpnpDevice } from '../discovery/upnp';
import type { Television } from '../shared/television';
import { platforms } from './registry';

export async function identify(
  host: string,
  openPorts: ReadonlySet<number>,
  upnp?: UpnpDevice,
  advertised?: readonly MdnsService[],
): Promise<Television | null> {
  for (const module of platforms()) {
    const television = await module.identify?.(host, openPorts, upnp, advertised);
    if (television) return television;
  }
  return null;
}
