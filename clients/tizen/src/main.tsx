import 'virtual:kroma-tv.css';
import { mountTv } from '@kromatv/tv/mount';
import { resolveTizenDeviceName } from './deviceName';

mountTv({ platform: 'Tizen', deviceName: resolveTizenDeviceName() });
