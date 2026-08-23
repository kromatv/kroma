import type { TvModule } from '../module';
import { androidSources, resolveAndroidArtifact } from './artifact';
import { ANDROID_PORTS, identifyAndroidTv } from './identify';
import { installAndroid } from './install';
import { ADB } from './tools';

export const androidtv: TvModule = {
  id: 'androidtv',
  label: 'Android TV',
  brands: 'Philips, Sony, TCL, Shield, Chromecast',
  package: '.apk',
  notReadyHint: 'network debugging off',
  enableSteps: 'network debugging',
  ports: ANDROID_PORTS,
  identify: identifyAndroidTv,
  tools: () => [ADB],
  sources: androidSources,
  resolve: resolveAndroidArtifact,
  install: installAndroid,
};
