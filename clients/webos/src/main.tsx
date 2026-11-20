import '@kromatv/ui/css/tv';
import { mountTv } from '@kromatv/tv/mount';
import { resolveWebOsDeviceName } from './device-name';
import { webOsLan } from './lan';
import { webOsWakeHint } from './wake-hint';

mountTv({
  platform: 'webOS',
  deviceName: resolveWebOsDeviceName(),
  lan: webOsLan(),
  wake: webOsWakeHint,
});
