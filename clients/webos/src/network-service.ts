import { networkInterfaces } from 'node:os';
import type Service from 'webos-service';

interface Link {
  address: string;
  mac: string;
}

const NO_HARDWARE = '00:00:00:00:00:00';

/** The interface this television is on the network by: the first one that is
 * not its loopback and carries an IPv4 address. */
export function connectedLink(): Link | null {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const entry of addresses ?? []) {
      const usable = entry.family === 'IPv4' && !entry.internal && entry.mac !== NO_HARDWARE;
      if (usable) {
        return { address: entry.address, mac: entry.mac };
      }
    }
  }
  return null;
}

/** Register `network`: the address and the hardware address of the interface
 * this television is connected by. The app is a browser and can read neither;
 * the service is Node and can. */
export function registerNetworkService(service: Pick<Service, 'register'>): void {
  service.register('network', (message) => {
    const link = connectedLink();
    message.respond(link ? { returnValue: true, ...link } : { returnValue: false });
  });
}
