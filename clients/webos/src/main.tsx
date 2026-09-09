import '@kromatv/ui/css/tv';
import { mountTv } from '@kromatv/tv/mount';
import { resolveWebOsDeviceName } from './deviceName';
import { webOsLan } from './lan';

mountTv({ platform: 'webOS', deviceName: resolveWebOsDeviceName(), lan: webOsLan() });
