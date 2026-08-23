import type { ArgsDef, SubCommandsDef } from 'citty';
import type { Platform } from '../television';
import { androidtv } from './androidtv/module';
import { appletv } from './appletv/module';
import type { ModuleOptions, TvModule } from './module';
import { tizen } from './tizen/module';
import { webos } from './webos/module';

const REGISTRY: readonly TvModule[] = [tizen, webos, androidtv, appletv];

export function modules(): readonly TvModule[] {
  return REGISTRY;
}

export function findModule(platform: Platform): TvModule | undefined {
  return REGISTRY.find((module) => module.id === platform);
}

export function moduleFor(platform: Platform): TvModule {
  const module = findModule(platform);
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

export function moduleArgs(): ArgsDef {
  const args: ArgsDef = {};
  for (const module of REGISTRY) Object.assign(args, module.flags);
  return args;
}

export function moduleCommands(): SubCommandsDef {
  const commands: SubCommandsDef = {};
  for (const module of REGISTRY) Object.assign(commands, module.commands);
  return commands;
}

export function moduleOptions(args: Record<string, unknown>): ModuleOptions {
  const options: Record<string, string | boolean> = {};
  for (const name of Object.keys(moduleArgs())) {
    const value = args[name];
    if (typeof value === 'string' || typeof value === 'boolean') options[name] = value;
  }
  return options;
}
