import '@kroma/tv/tv.css';
import { mountTv } from '@kroma/tv/mount';
import { resolveWebOsDeviceName } from './deviceName';
import { webOsLan } from './lan';

mountTv({ platform: 'webOS', deviceName: resolveWebOsDeviceName(), lan: webOsLan() });
