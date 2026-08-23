import { fetchText } from './http';

export interface UpnpDevice {
  friendlyName: string;
  manufacturer: string;
  modelName: string;
  modelNumber: string;
}

const MAX_DESCRIPTION_BYTES = 32 * 1024;

export function parseDeviceDescription(xml: string): UpnpDevice {
  return {
    friendlyName: tagText(xml, 'friendlyName'),
    manufacturer: tagText(xml, 'manufacturer'),
    modelName: tagText(xml, 'modelName'),
    modelNumber: tagText(xml, 'modelNumber'),
  };
}

/** The UPnP description a television's SSDP reply points at, or null if it lies. */
export async function fetchDeviceDescription(location: string): Promise<UpnpDevice | null> {
  const xml = await fetchText(location, { maxBytes: MAX_DESCRIPTION_BYTES });
  if (!xml) return null;
  const device = parseDeviceDescription(xml);
  return device.friendlyName || device.manufacturer ? device : null;
}

function tagText(xml: string, tag: string): string {
  const match = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i').exec(xml);
  return match?.[1]?.trim() ?? '';
}
