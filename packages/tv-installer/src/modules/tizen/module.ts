import type { TvModule } from '../module';
import { resolveTizenArtifact, tizenSources } from './artifact';
import { certificateCommand } from './certificate-command';
import { identifyTizen, TIZEN_PORTS } from './identify';
import { installTizen } from './install';
import { probeCommand } from './probe-command';

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
      default: true,
      description: 'Samsung only: install over the sdb client built into this tool',
      negativeDescription:
        "Samsung only: drive Tizen Studio's own tizen and sdb, already installed",
    },
  },
  remembers: ['profile'],
  commands: { probe: probeCommand, certificate: certificateCommand },
  identify: identifyTizen,
  tools: () => [],
  sources: tizenSources,
  resolve: resolveTizenArtifact,
  install: installTizen,
};
