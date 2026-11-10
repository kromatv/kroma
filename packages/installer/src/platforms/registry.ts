import type { ArgsDef, SubCommandsDef } from 'citty';
import { androidtv } from './androidtv/module';
import { appletv } from './appletv/module';
import type { PlatformOptions, Platform } from './platform';
import { tizen } from './tizen/module';
import { webos } from './webos/module';

const REGISTRY: readonly Platform[] = [tizen, webos, androidtv, appletv];

export function platforms(): readonly Platform[] {
  return REGISTRY;
}

export function findPlatform(platform: string): Platform | undefined {
  return REGISTRY.find((module) => module.id === platform);
}

export function platformFor(platform: string): Platform {
  const module = findPlatform(platform);
  if (!module) throw new Error(`no module answers for ${platform}`);
  return module;
}

export function sweepPorts(): number[] {
  return REGISTRY.flatMap((module) => [...(module.ports?.sweep ?? [])]);
}

export function detailPorts(): number[] {
  return REGISTRY.flatMap((module) => [...(module.ports?.detail ?? [])]);
}

export function searchTargets(): string[] {
  return REGISTRY.flatMap((module) => [...(module.searchTargets ?? [])]);
}

export function platformArgs(): ArgsDef {
  const args: ArgsDef = {};
  for (const module of REGISTRY) Object.assign(args, module.flags);
  return args;
}

export function platformCommands(): SubCommandsDef {
  const commands: SubCommandsDef = {};
  for (const module of REGISTRY) Object.assign(commands, module.commands);
  return commands;
}

export function platformOptions(args: Record<string, unknown>): PlatformOptions {
  const options: Record<string, string | boolean> = {};
  for (const name of Object.keys(platformArgs())) {
    const value = args[name];
    if (typeof value === 'string' || typeof value === 'boolean') options[name] = value;
  }
  return options;
}
