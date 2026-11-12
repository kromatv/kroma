// Resolves a module's declared `icon` name (a plain string in its manifest/nav)
// to a glyph the kit draws. Keeps a small curated set relevant to modules;
// anything unknown falls back to the generic apps icon.

import type { IconName } from '@kromatv/ui/kit';

const ICONS: Record<string, IconName> = {
  apps: 'apps',
  puzzle: 'puzzle',
  download: 'download',
  'file-text': 'file-text',
  magnet: 'magnet',
  antenna: 'antenna',
  rss: 'rss',
  movie: 'movie',
  tv: 'device-tv',
  chart: 'chart-bar',
  stats: 'chart-bar',
  database: 'database',
  world: 'world',
  cloud: 'cloud',
  ai: 'sparkles',
  vpn: 'shield-lock',
  server: 'server',
  subtitles: 'language',
  task: 'subtask',
};

/** Resolve a module `icon` name to a kit glyph name (fallback: apps). */
export function resolveModuleIcon(name?: string): IconName {
  return (name ? ICONS[name] : undefined) ?? 'apps';
}
