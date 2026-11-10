import type { TvModule } from '../module';
import { androidSources, resolveAndroidArtifact } from './artifact';
import { ANDROID_PORTS, identifyAndroidTv } from './identify';
import { installAndroid } from './install';

export const androidtv: TvModule = {
  id: 'androidtv',
  label: 'Android TV',
  brands: 'Google TV, Sony, TCL, Philips, Shield',
  package: '.apk',
  notReadyHint: 'network debugging off',
  enableSteps: 'network debugging',
  setup: () => [
    'In Settings, open System, About, and select Android TV OS build seven times.',
    'In System, Developer options, turn on Network debugging or USB debugging.',
    'When this computer connects, allow it on the TV and tick Always allow.',
  ],
  guide: 'android-tv',
  ports: ANDROID_PORTS,
  identify: identifyAndroidTv,
  tools: () => [],
  sources: androidSources,
  resolve: resolveAndroidArtifact,
  install: installAndroid,
};
