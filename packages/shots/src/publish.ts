import { run } from './sh';
import type { Shot } from './shot';

// One release holds every screenshot the issues and PRs point at. It is a plain
// asset bucket, never a build: GitHub serves the files, and nothing in the repo
// grows a binary.
const ASSET_RELEASE = 'issue-assets';

/** Upload the run to the asset release, replacing an asset of the same name so
 * re-running a capture updates the image a PR already links. Returns the
 * markdown block, with the published URLs. */
export function publish(repo: string, shots: readonly Shot[], slug: string): string {
  ensureRelease(repo);
  for (const shot of shots) {
    run('gh', ['release', 'upload', ASSET_RELEASE, shot.file, '--clobber', '--repo', repo]);
  }
  return markdown(repo, shots, slug);
}

function ensureRelease(repo: string): void {
  const found = run(
    'gh',
    ['release', 'view', ASSET_RELEASE, '--repo', repo, '--json', 'tagName'],
    'text',
    {
      allowFailure: true,
    },
  );
  if (found.includes(ASSET_RELEASE)) return;
  run('gh', [
    'release',
    'create',
    ASSET_RELEASE,
    '--repo',
    repo,
    '--title',
    'Issue and PR assets',
    '--notes',
    'Images referenced from issues and pull requests. Not a build.',
  ]);
}

/** The block to paste into a PR or issue. Collapsed, because a set of five
 * 1080p frames pushes the description itself off the screen. */
export function markdown(repo: string, shots: readonly Shot[], slug: string): string {
  const base = `https://github.com/${repo}/releases/download/${ASSET_RELEASE}`;
  const images = shots
    .map((shot) => `**${shot.label}**\n\n![${shot.label}](${base}/${basename(shot.file)})`)
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

function basename(file: string): string {
  return file.slice(file.lastIndexOf('/') + 1);
}
