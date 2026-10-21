import { z } from 'zod';
import { decide, type PackageFiles, type PublishDecision } from './content-hash';

const PackageName = z.object({ name: z.string().min(1) }).loose();

export interface Registry {
  /** The tarball bytes behind `<name>@<tag>`, or null when nothing is published there. */
  publishedTarball(name: string, tag: string): Promise<Uint8Array | null>;
  publish(
    tarball: string,
    options: { tag: string; provenance: boolean; dryRun: boolean },
  ): Promise<void>;
}

export type PublishRequest = {
  tarball: string;
  tag: string;
  provenance: boolean;
  dryRun: boolean;
};

export type PublishDeps = {
  registry: Registry;
  read: (gzipped: Uint8Array) => PackageFiles;
  load: (path: string) => Promise<Uint8Array>;
};

export function packageName(files: PackageFiles): string {
  const raw = files.get('package.json');
  if (!raw) throw new Error('the tarball has no package.json');
  return PackageName.parse(JSON.parse(new TextDecoder().decode(raw))).name;
}

export async function publishTarball(
  request: PublishRequest,
  deps: PublishDeps,
): Promise<PublishDecision & { name: string }> {
  const local = deps.read(await deps.load(request.tarball));
  const name = packageName(local);
  const bytes =
    request.tag === 'canary' ? await deps.registry.publishedTarball(name, request.tag) : null;
  const decision = decide({ tag: request.tag, local, published: bytes ? deps.read(bytes) : null });
  if (decision.publish) await deps.registry.publish(request.tarball, request);
  return { ...decision, name };
}
