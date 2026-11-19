import '@kromatv/ui/css/tv';
import { mountTv } from '@kromatv/tv/mount';
import { resolveTizenDeviceName } from './device-name';
import { tizenWakeHint } from './wake-hint';

mountTv({ platform: 'Tizen', deviceName: resolveTizenDeviceName(), wake: tizenWakeHint });
