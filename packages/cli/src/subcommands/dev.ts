import { defineCommand } from 'citty';
import { exitAfter } from '../exit-after';
import { serverArgs, text } from './args';

export const dev = defineCommand({
  meta: {
    name: 'dev',
    description: 'Build the module, install it on a server, and again on every save.',
  },
  args: {
    dir: {
      type: 'positional',
      required: false,
      description: 'The module directory (default: here)',
    },
    ...serverArgs,
  },
  run: ({ args }) =>
    exitAfter(
      import('../commands/dev').then((m) =>
        m.devCommand({
          dir: text(args.dir),
          server: text(args.server),
          token: text(args.token),
        }),
      ),
    ),
});
