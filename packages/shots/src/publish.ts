import { attach, githubContext } from './attach';
import type { Shot } from './shot';

/** Uploads every shot as a GitHub attachment of `repo` and returns the markdown
 * block that shows them. An attachment is never replaced: a re-run uploads new
 * ones, so the block in the PR is replaced with the new one. */
export async function publish(repo: string, shots: readonly Shot[], slug: string): Promise<string> {
  const context = githubContext(repo);
  const links = await Promise.all(shots.map((shot) => attach(shot.file, context)));
  return markdown(shots, links, slug);
}

/** The block to paste into a PR or issue, `links` holding one URL or local path
 * per shot. Collapsed, because a set of five 1080p frames pushes the
 * description itself off the screen. */
export function markdown(shots: readonly Shot[], links: readonly string[], slug: string): string {
  const images = shots
    .map((shot, at) => `**${shot.label}**\n\n![${shot.label}](${links[at] ?? shot.file})`)
    .join('\n\n');
  const captured = shots.map((shot) => shot.label).join(' · ');
  return [
    `<details><summary>Screenshots: ${captured}</summary>`,
    '',
    images,
    '',
    '</details>',
    '',
    `_Captured with \`bun run shots:pr ${slug}\`._`,
  ].join('\n');
}
