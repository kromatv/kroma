import type { ArgsDef, SubCommandsDef } from 'citty';
import type { UpnpDevice } from '../discovery/upnp';
import type { ArtifactRequest, Source } from '../install/artifact';
import type { LogLine } from '../run';
import type { Platform, Television } from '../television';
import type { Tool } from '../toolchain/detect';

export type ModuleOptions = Readonly<Record<string, string | boolean | undefined>>;

export interface InstallContext {
  tv: Television;
  artifact: string;
  log: LogLine;
  launch: boolean;
  options: ModuleOptions;
}

export interface ModulePorts {
  sweep: readonly number[];
  detail: readonly number[];
}

export interface TvModule {
  id: Platform;
  label: string;
  brands: string;
  package: string;
  notReadyHint: string;
  enableSteps?: string;
  ports?: ModulePorts;
  searchTargets?: readonly string[];
  flags?: ArgsDef;
  commands?: SubCommandsDef;
  identify?(
    host: string,
    openPorts: ReadonlySet<number>,
    upnp?: UpnpDevice,
  ): Promise<Television | null>;
  discover?(): Promise<Television[]>;
  prompt?(sets: readonly Television[]): Promise<Map<string, ModuleOptions> | null>;
  tools(): readonly Tool[];
  sources(): readonly Source[];
  resolve(request: ArtifactRequest): Promise<string>;
  install(context: InstallContext): Promise<void>;
}

export function stringOption(options: ModuleOptions, name: string): string | undefined {
  const value = options[name];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

export function booleanOption(options: ModuleOptions, name: string): boolean | undefined {
  const value = options[name];
  return typeof value === 'boolean' ? value : undefined;
}
