import { type Platform, WEB_FLAG } from '../platform';
import { resolveWebosArtifact, webosSources } from './artifact';
import { identifyWebos, WEBOS_PORTS, WEBOS_SEARCH_TARGET } from './identify';
import { installWebos } from './install';
import { askPassphrases } from './prompt';

export const webos: Platform = {
  id: 'webos',
  label: 'LG',
  brands: 'LG',
  package: '.ipk',
  notReadyHint: 'Dev Mode app not running',
  enableSteps: 'the Dev Mode app',
  setup: () => [
    'Install the Developer Mode app from the LG Content Store.',
    'Open it, sign in with your LG developer account, and turn on Dev Mode.',
    'Open it again and turn on Key Server. Keep the passphrase it shows.',
  ],
  guide: 'lg-tv',
  ports: WEBOS_PORTS,
  searchTargets: [WEBOS_SEARCH_TARGET],
  flags: {
    passphrase: {
      type: 'string',
      valueHint: 'passphrase',
      description: 'The LG Dev Mode passphrase, so the install asks nothing',
    },
    ...WEB_FLAG,
  },
  remembers: ['web'],
  identify: identifyWebos,
  prompt: askPassphrases,
  sources: webosSources,
  resolve: resolveWebosArtifact,
  install: installWebos,
};
