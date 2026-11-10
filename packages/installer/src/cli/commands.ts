import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { scan } from '../discovery/scan';
import { diagnoseEmptyScan } from '../discovery/hints';
import type { Source } from '../install/artifact';
import { deployTo } from '../install/deploy';
import { askForLocalNetwork } from '../discovery/local-network';
import type { PlatformOptions } from '../platforms/platform';
import { platformFor } from '../platforms/registry';
import { root } from '../shared/root';
import { runtimeLabel, type Television } from '../shared/television';
import { style } from '../tui/ansi';
import { injectUsage, renderUsage, type UsageCommand } from './usage';

export interface CommandOptions {
  hosts?: string[];
  artifact?: string;
  source?: Source;
  platformOptions?: PlatformOptions;
  launch: boolean;
  json: boolean;
}

export async function scanCommand(options: CommandOptions): Promise<number> {
  await askForLocalNetwork();
  const found = await scan({ hosts: options.hosts });
  if (options.json) {
    console.log(JSON.stringify(found, null, 2));
    return 0;
  }
  if (found.length === 0) {
    console.log('no television answered on this network');
    for (const hint of (await diagnoseEmptyScan()).hints) console.log(style.dim(hint));
    return 1;
  }
  for (const tv of found) console.log(describe(tv));
  return 0;
}

export async function installCommand(target: string, options: CommandOptions): Promise<number> {
  const hosts = target === 'all' ? options.hosts : [target];
  await askForLocalNetwork();
  const found = await scan({ hosts });
  const matched = target === 'all' ? found : found.filter((tv) => tv.host === target);
  for (const tv of matched.filter((candidate) => !candidate.sideloadable)) {
    console.error(style.yellow(`skipping ${tv.name} (${tv.host}): ${tv.note}`));
  }

  const chosen = matched.filter((tv) => tv.sideloadable);
  if (chosen.length === 0) {
    console.error(
      target === 'all'
        ? 'no television to install onto'
        : `${target} is not a television this tool can install onto`,
    );
    for (const hint of (await diagnoseEmptyScan()).hints) console.error(style.dim(hint));
    return 1;
  }

  let failures = 0;
  for (const tv of chosen) {
    console.log(describe(tv));
    try {
      await deployTo(tv, {
        log: (line) => console.log(style.dim(`  ${line}`)),
        artifact: options.artifact,
        launch: options.launch,
        source: options.source,
        platformOptions: options.platformOptions,
      });
      console.log(style.green(`  installed on ${tv.name}`));
    } catch (error) {
      failures++;
      console.error(style.red(`  ${error instanceof Error ? error.message : String(error)}`));
    }
  }
  return failures === 0 ? 0 : 1;
}

const HOST_WIDTH = 24;
const VENDOR_WIDTH = 16;
const NAME_WIDTH = 26;

function describe(tv: Television): string {
  const platform = `${tv.vendor} ${platformFor(tv.platform).package}`;
  const state = tv.developerMode === 'on' ? style.green('ready') : style.yellow(tv.note);
  const runs = runtimeLabel(tv.runtime);
  const head = [
    style.bold(cell(tv.host, HOST_WIDTH)),
    cell(platform, VENDOR_WIDTH),
    cell(tv.name || tv.model, NAME_WIDTH),
    state,
  ].join('');
  return runs ? `${head}\n${' '.repeat(HOST_WIDTH)}${style.dim(runs)}` : head;
}

function cell(text: string, width: number): string {
  return text.length >= width ? `${text.slice(0, width - 2)}… ` : text.padEnd(width);
}

const README = 'packages/installer/README.md';

/** Renders the command tree into the README, so no usage line is typed by hand. */
export async function docsCommand(command: UsageCommand, check: boolean): Promise<number> {
  const path = join(root, README);
  const current = await readFile(path, 'utf8');
  const written = injectUsage(current, await renderUsage(command, 'bun run tv'));

  if (written === current) {
    console.log(`${README} is current`);
    return 0;
  }
  if (check) {
    console.error(`${README} is out of date: run bun run tv docs`);
    return 1;
  }
  await writeFile(path, written);
  console.log(`wrote the usage block into ${README}`);
  return 0;
}
