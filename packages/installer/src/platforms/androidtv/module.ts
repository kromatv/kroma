import type { Platform } from '../platform';
import { androidSources, resolveAndroidArtifact } from './artifact';
import { ANDROID_PORTS, ANDROID_SERVICES, identifyAndroidTv } from './identify';
import { installAndroid } from './install';
import { askPairingCodes } from './prompt';

export const androidtv: Platform = {
  id: 'androidtv',
  label: 'Android TV',
  brands: 'Google TV, Sony, TCL, Philips, Shield',
  package: '.apk',
  notReadyHint: 'debugging off',
  enableSteps: 'Wireless debugging, or Network debugging',
  setup: () => [
    'In Settings, open System, About, and select Android TV OS build seven times.',
    'In System, Developer options, turn on Wireless debugging, or Network debugging where the TV has it.',
    'When this computer connects, allow it on the TV, or type here the pairing code the TV shows.',
  ],
  guide: 'android-tv',
  ports: ANDROID_PORTS,
  services: ANDROID_SERVICES,
  flags: {
    'pairing-code': {
      type: 'string',
      valueHint: 'code',
      description: 'Android TV only: the Wireless debugging pairing code the TV shows',
    },
  },
  identify: identifyAndroidTv,
  prompt: askPairingCodes,
  sources: androidSources,
  resolve: resolveAndroidArtifact,
  install: installAndroid,
};
