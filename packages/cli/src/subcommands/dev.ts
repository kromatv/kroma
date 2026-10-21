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
    target: {
      type: 'string',
      valueHint: 'triple',
      description: 'Cross-compile the sidecar for the server',
    },
    ...serverArgs,
  },
  run: ({ args }) =>
    exitAfter(
      import('../commands/dev').then((m) =>
        m.devCommand({
          dir: text(args.dir),
          target: text(args.target),
          server: text(args.server),
          token: text(args.token),
        }),
      ),
    ),
});
