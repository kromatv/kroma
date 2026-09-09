import '@kromatv/ui/css/tv';
import { mountTv } from '@kromatv/tv/mount';
import { resolveTizenDeviceName } from './deviceName';

mountTv({ platform: 'Tizen', deviceName: resolveTizenDeviceName() });
