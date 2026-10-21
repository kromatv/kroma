import { defineCommand } from 'citty';
import { exitAfter } from '../exit-after';
import { dirsArg, list } from './args';

export const check = defineCommand({
  meta: {
    name: 'check',
    description: 'Validate the manifest, type-check the frontend, clippy the sidecar.',
  },
  args: {
    dirs: dirsArg,
    rust: {
      type: 'boolean',
      default: true,
      description: 'Run clippy',
      negativeDescription: 'Skip clippy',
    },
    ts: { type: 'boolean', default: true, description: 'Run tsc', negativeDescription: 'Skip tsc' },
  },
  run: ({ args }) =>
    exitAfter(
      import('../commands/check').then((m) =>
        m.checkCommand({ dirs: list(args._), rust: args.rust !== false, ts: args.ts !== false }),
      ),
    ),
});
