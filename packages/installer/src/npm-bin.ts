#!/usr/bin/env node
import { olderThan } from './shared/version';

const floor = process.env.KROMA_TV_NODE_FLOOR ?? '0';
const running = process.versions.node;

if (olderThan(running, floor)) {
  process.stderr.write(
    `KROMA's installer needs Node.js ${floor} or later, and this computer has Node.js ${running}.\nInstall the LTS version from https://nodejs.org, then run the command again.\n`,
  );
  process.exit(1);
}

await import(new URL('./cli.js', import.meta.url).href);
