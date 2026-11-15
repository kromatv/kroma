import type { ArgsDef, SubCommandsDef } from 'citty';
import type { UpnpDevice } from '../discovery/upnp';
import type { ArtifactRequest, Source } from '../install/artifact';
import type { LogLine } from '../shared/run';
import type { Television } from '../shared/television';

export type PlatformOptions = Readonly<Record<string, string | boolean | undefined>>;

export interface InstallContext {
  tv: Television;
  artifact: string;
  log: LogLine;
  launch: boolean;
  options: PlatformOptions;
}

export interface PlatformPorts {
  sweep: readonly number[];
  detail: readonly number[];
}

export interface Platform {
  id: string;
  label: string;
  brands: string;
  package: string;
  notReadyHint: string;
  enableSteps?: string;
  setup?(computer: string | null): readonly string[];
  guide?: string;
  ports?: PlatformPorts;
  searchTargets?: readonly string[];
  flags?: ArgsDef;
  remembers?: readonly string[];
  commands?: SubCommandsDef;
  identify?(
    host: string,
    openPorts: ReadonlySet<number>,
    upnp?: UpnpDevice,
  ): Promise<Television | null>;
  discover?(): Promise<Television[]>;
  prompt?(sets: readonly Television[]): Promise<Map<string, PlatformOptions> | null>;
  sources(): readonly Source[];
  resolve(request: ArtifactRequest): Promise<string>;
  install(context: InstallContext): Promise<void>;
}

export function stringOption(options: PlatformOptions, name: string): string | undefined {
  const value = options[name];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

export function booleanOption(options: PlatformOptions, name: string): boolean | undefined {
  const value = options[name];
  return typeof value === 'boolean' ? value : undefined;
}

/** The flag that installs a television's web app in place of its native one. */
export const WEB_FLAG: ArgsDef = {
  web: {
    type: 'boolean',
    description: 'Samsung and LG: install the web app instead of the native one',
    negativeDescription: 'Samsung and LG: install the native app, also where the web one was',
  },
};

/** True when the install asked for the web app, here or on an earlier install. */
export function wantsWeb(options: PlatformOptions | undefined): boolean {
  return booleanOption(options ?? {}, 'web') === true;
}
