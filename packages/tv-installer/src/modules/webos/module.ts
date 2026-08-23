import type { TvModule } from '../module';
import { resolveWebosArtifact, webosSources } from './artifact';
import { identifyWebos, WEBOS_PORTS, WEBOS_SEARCH_TARGET } from './identify';
import { installWebos } from './install';
import { askPassphrases } from './prompt';
import { ARES } from './tools';

export const webos: TvModule = {
  id: 'webos',
  label: 'LG',
  brands: 'LG',
  package: '.ipk',
  notReadyHint: 'Dev Mode app not running',
  enableSteps: 'the Dev Mode app',
  ports: WEBOS_PORTS,
  searchTargets: [WEBOS_SEARCH_TARGET],
  flags: {
    passphrase: {
      type: 'string',
      valueHint: 'passphrase',
      description: 'The LG Dev Mode passphrase, so the install asks nothing',
    },
  },
  identify: identifyWebos,
  prompt: askPassphrases,
  tools: () => [ARES],
  sources: webosSources,
  resolve: resolveWebosArtifact,
  install: installWebos,
};
