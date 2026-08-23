import type { ArtifactRequest } from '../../install/artifact';
import type { InstallContext, TvModule } from '../module';
import {
  type AppleTv,
  appleTvSources,
  installAppleTv,
  listAppleTvs,
  resolveAppleTvApp,
} from './index';
import { pairedTelevisions } from './paired';

export const appletv: TvModule = {
  id: 'appletv',
  label: 'Apple TV',
  brands: 'Apple',
  package: '.app',
  notReadyHint: 'not paired',
  discover: pairedTelevisions,
  tools: () => [],
  sources: appleTvSources,
  resolve: resolveApp,
  install: deploy,
};

async function pairedWith(name: string, identifier: string | undefined): Promise<AppleTv> {
  const paired = await listAppleTvs();
  const set = paired.find(
    (candidate) => candidate.identifier === identifier || candidate.name === name,
  );
  if (!set) throw new Error(`${name} is no longer paired with this Mac: pair it again in Xcode`);
  return set;
}

async function resolveApp({ tv, given, source, log }: ArtifactRequest): Promise<string> {
  const set = await pairedWith(tv.name, tv.identifier);
  return resolveAppleTvApp({
    given,
    source: source === 'build' ? 'build' : undefined,
    udid: set.udid,
    log,
  });
}

async function deploy({ tv, artifact, log, launch }: InstallContext): Promise<void> {
  const set = await pairedWith(tv.name, tv.identifier);
  await installAppleTv({ identifier: set.identifier, app: artifact, log, launch });
}
