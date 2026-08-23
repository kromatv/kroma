import type { TvModule } from '../module';
import { resolveTizenArtifact, tizenSources } from './artifact';
import { certificateCommand } from './certificate-command';
import { identifyTizen, TIZEN_PORTS } from './identify';
import { installTizen } from './install';
import { probeCommand } from './probe-command';
import { SDB, TIZEN_CLI } from './tools';

export const tizen: TvModule = {
  id: 'tizen',
  label: 'Samsung',
  brands: 'Samsung',
  package: '.wgt',
  notReadyHint: 'developer mode off',
  enableSteps: 'Apps, then 1 2 3 4 5',
  ports: TIZEN_PORTS,
  flags: {
    profile: {
      type: 'string',
      valueHint: 'name',
      description: 'Samsung only: the signing profile, instead of the active one',
    },
    native: {
      type: 'boolean',
      default: false,
      description: "Samsung only: talk sdb ourselves, instead of Tizen Studio's tools",
    },
  },
  commands: { probe: probeCommand, certificate: certificateCommand },
  identify: identifyTizen,
  tools: () => [TIZEN_CLI, SDB],
  sources: tizenSources,
  resolve: resolveTizenArtifact,
  install: installTizen,
};
