import 'virtual:kroma-tv.css';
import { mountTv } from '@kroma/tv/mount';
import { resolveTizenDeviceName } from './deviceName';

mountTv({ platform: 'Tizen', deviceName: resolveTizenDeviceName() });
