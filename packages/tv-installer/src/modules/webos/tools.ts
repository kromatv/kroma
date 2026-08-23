import { homedir } from 'node:os';
import { join } from 'node:path';
import { type LogLine, runOk } from '../../run';
import { KROMA_TOOLS, type Tool } from '../../toolchain/detect';

export const ARES: Tool = {
  id: 'ares',
  label: 'webOS TV CLI',
  binary: 'ares-install',
  source: 'bun add -g @webos-tools/cli',
  candidates: () => [
    join(homedir(), '.bun', 'bin', 'ares-install'),
    join(KROMA_TOOLS, 'node_modules', '.bin', 'ares-install'),
    '/usr/local/bin/ares-install',
    '/opt/homebrew/bin/ares-install',
  ],
  install: (log: LogLine) => runOk(['bun', 'add', '-g', '@webos-tools/cli'], { log }).then(),
};

export function aresSibling(aresInstall: string, binary: string): string {
  return join(aresInstall.slice(0, aresInstall.lastIndexOf('/')), binary);
}
