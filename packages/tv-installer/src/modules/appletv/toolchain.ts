import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { root } from '../../root';

export type AppleTvToolId = 'xcode' | 'devicectl' | 'cocoapods' | 'prebuild';

export type AppleTvIntent = 'install' | 'build';

export const APPLETV_TOOLS: Record<AppleTvToolId, { label: string; source: string }> = {
  xcode: { label: 'Xcode', source: 'the Mac App Store, then xcode-select --switch' },
  devicectl: {
    label: 'Xcode device tools',
    source: 'the full Xcode: the standalone command line tools do not carry devicectl',
  },
  cocoapods: { label: 'CocoaPods', source: 'brew install cocoapods' },
  prebuild: {
    label: 'the Expo prebuild',
    source: "bun run --filter '@kroma/tv-native' prebuild",
  },
};

export const APPLETV_TOOLS_FOR: Record<AppleTvIntent, readonly AppleTvToolId[]> = {
  install: ['xcode', 'devicectl'],
  build: ['xcode', 'devicectl', 'cocoapods', 'prebuild'],
};

const WORKSPACE = 'clients/tv-native/ios/KROMA.xcworkspace';

export function locateAppleTvTool(tool: AppleTvToolId): string | null {
  if (process.platform !== 'darwin') return null;
  if (tool === 'xcode') return developerDirectory();
  if (tool === 'devicectl') return found(['xcrun', '--find', 'devicectl']);
  if (tool === 'cocoapods') return Bun.which('pod');
  return existing(join(root, WORKSPACE));
}

export function missingAppleTvTools(intent: AppleTvIntent): AppleTvToolId[] {
  return APPLETV_TOOLS_FOR[intent].filter((tool) => locateAppleTvTool(tool) === null);
}

export function requireAppleTvTool(tool: AppleTvToolId): string {
  const path = locateAppleTvTool(tool);
  if (path) return path;
  throw new Error(`${APPLETV_TOOLS[tool].label} is missing: ${APPLETV_TOOLS[tool].source}`);
}

function developerDirectory(): string | null {
  const selected = found(['xcode-select', '-p']);
  return selected && existsSync(join(selected, 'usr', 'bin')) ? selected : null;
}

function found(command: readonly string[]): string | null {
  const [file = '', ...args] = command;
  const { exitCode, stdout } = Bun.spawnSync([file, ...args], { stderr: 'ignore' });
  return exitCode === 0 ? existing(stdout.toString().trim()) : null;
}

function existing(path: string): string | null {
  return path && existsSync(path) ? path : null;
}
