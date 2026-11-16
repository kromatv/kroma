import '@kromatv/ui/css/tv';
import { mountTv } from '@kromatv/tv/mount';
import { resolveTizenDeviceName } from './device-name';

mountTv({ platform: 'Tizen', deviceName: resolveTizenDeviceName() });
