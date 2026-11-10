import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { type LogLine, runOk } from '../../run';
import { KROMA_TOOLS, type Tool } from '../../toolchain/detect';
import { which } from '../../toolchain/which';

const PACKAGE = '@webos-tools/cli';

export const ARES: Tool = {
  id: 'ares',
  label: 'webOS TV CLI',
  binary: 'ares-install',
  source: `npm, ${PACKAGE}`,
  candidates: () => [
    join(homedir(), '.bun', 'bin', 'ares-install'),
    join(KROMA_TOOLS, 'node_modules', '.bin', 'ares-install'),
    '/usr/local/bin/ares-install',
    '/opt/homebrew/bin/ares-install',
  ],
  install: installAres,
};

async function installAres(log: LogLine): Promise<void> {
  if (which('bun')) {
    await runOk(['bun', 'add', '-g', PACKAGE], { log });
    return;
  }
  await mkdir(KROMA_TOOLS, { recursive: true });
  await runOk(['npm', 'install', '--prefix', KROMA_TOOLS, '--no-audit', '--no-fund', PACKAGE], {
    log,
  });
}

export function aresSibling(aresInstall: string, binary: string): string {
  return join(aresInstall.slice(0, aresInstall.lastIndexOf('/')), binary);
}
