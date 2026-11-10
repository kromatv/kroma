import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Tool } from '../../toolchain/detect';

export const TIZEN_HOME = process.env.TIZEN_HOME ?? join(homedir(), 'tizen-studio');

const TIZEN_STUDIO = 'Tizen Studio, from developer.samsung.com/smarttv';

export const TIZEN_CLI: Tool = {
  id: 'tizen',
  label: 'Tizen Studio CLI',
  binary: 'tizen',
  source: TIZEN_STUDIO,
  candidates: () => [join(TIZEN_HOME, 'tools', 'ide', 'bin', 'tizen')],
};

export const SDB: Tool = {
  id: 'sdb',
  label: 'Smart Debug Bridge',
  binary: 'sdb',
  source: TIZEN_STUDIO,
  candidates: () => [join(TIZEN_HOME, 'tools', 'sdb')],
};
