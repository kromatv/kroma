import * as p from '@clack/prompts';
import { PUBLISHED_PACKAGE } from '../cli/published';
import { style } from './ansi';

const WORDMARK = ['█▄▀ █▀█ █▀█ █▀▄▀█ ▄▀█', '█ █ █▀▄ █▄█ █ ▀ █ █▀█'];

/** How this run was started, so the help it prints can be typed back as it is. */
export function invocation(env: NodeJS.ProcessEnv = process.env): string {
  if (env.npm_command === 'exec') return `npx ${PUBLISHED_PACKAGE}`;
  if (env.npm_lifecycle_event === 'tv') return 'bun run tv';
  return 'kroma-tv';
}

/** The wordmark, what the installer is about to ask, and the commands worth knowing. */
export function bannerText(version: string | undefined, command: string): string[] {
  const [top = '', bottom = ''] = WORDMARK;
  const name = version ? `TV installer ${version}` : 'TV installer';
  const commands: [string, string][] = [
    [`${command} update`, 'update every TV installed from here'],
    [`${command} --help`, 'every command and option'],
    ['ctrl-c', 'quit at any time'],
  ];
  const width = Math.max(...commands.map(([typed]) => typed.length));
  return [
    `  ${style.bold(top)}`,
    `  ${style.bold(bottom)}  ${style.dim(name)}`,
    '',
    ...commands.map(([typed, what]) => `${typed.padEnd(width)}   ${style.dim(what)}`),
  ];
}

/** Prints the banner and opens the session. */
export function showBanner(version?: string, command = invocation()): void {
  const [top, bottom, , ...help] = bannerText(version, command);
  console.log(`\n${top}\n${bottom}\n`);
  p.intro('Installs KROMA on the TVs on this network');
  p.note(
    [
      'It asks which version and which kind of TV,',
      'then looks for those TVs on the network.',
      '',
      ...help,
    ].join('\n'),
    'How it works',
  );
}
