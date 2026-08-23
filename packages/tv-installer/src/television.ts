export type Platform = string;

export type DeveloperMode = 'on' | 'off' | 'unknown';

export type Learned = 'reported' | 'derived';

/** A null anywhere means nothing named a version, never a guess at one. */
export interface Runtime {
  name: string;
  version: string;
  engine: { name: string; version: string | null } | null;
  learned: Learned;
}

export interface Television {
  host: string;
  platform: Platform;
  vendor: string;
  name: string;
  model: string;
  developerMode: DeveloperMode;
  sideloadable: boolean;
  note: string;
  runtime: Runtime | null;
  identifier?: string;
}

/** `Android 12, WebView 108`, trailed by `by model` for a version nothing reported. */
export function runtimeLabel(runtime: Runtime | null): string {
  if (!runtime) return '';
  const { engine } = runtime;
  const parts = [`${runtime.name} ${runtime.version}`];
  if (engine) parts.push(engine.version ? `${engine.name} ${engine.version}` : engine.name);
  if (runtime.learned === 'derived') parts.push('by model');
  return parts.join(', ');
}
