import '@kroma/tv/tv.css';
import { mountTv } from '@kroma/tv/mount';
import { resolveWebOsDeviceName } from './deviceName';

mountTv({ platform: 'webOS', deviceName: resolveWebOsDeviceName() });
