import * as p from '@clack/prompts';
import { site } from '@kromatv/site-meta';
import { localSubnets } from '../discovery/lan';
import type { Platform } from '../platforms/platform';
import { platformFor } from '../platforms/registry';

function steps(module: Platform, computer: string | null): string[] {
  const numbered = (module.setup?.(computer) ?? []).map((step, at) => `${at + 1}. ${step}`);
  const guide = module.guide ? [`Step by step: ${site.links.installGuide}/${module.guide}`] : [];
  return [...numbered, ...guide];
}

/** The one-time steps on each kind of TV, with this computer's address where a TV asks for it. */
export function setupText(
  kinds: readonly Platform[],
  computer: string | null,
): { title: string; body: string } | null {
  const shown = kinds.filter((module) => module.setup);
  const [only] = shown;
  if (!only) return null;
  if (shown.length === 1) {
    return { title: `Once, on the ${only.label} TV`, body: steps(only, computer).join('\n') };
  }
  const sections = shown.map((module) => [module.label, ...steps(module, computer)].join('\n'));
  return { title: 'Once, on each TV', body: sections.join('\n\n') };
}

/** Shows what the chosen kinds of TV need once before they answer a scan. */
export function showSetup(platforms: readonly string[]): void {
  const text = setupText(platforms.map(platformFor), localSubnets()[0]?.address ?? null);
  if (text) p.note(text.body, text.title);
}
