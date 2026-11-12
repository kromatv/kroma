import { defineCommand } from 'citty';
import { exitAfter } from '../exit-after';
import { dirsArg, list, text } from './args';

export const build = defineCommand({
  meta: {
    name: 'build',
    description: 'Pack the installable .kmod: the component, the frontend, the manifest.',
  },
  args: {
    dirs: dirsArg,
    out: {
      type: 'string',
      valueHint: 'dir',
      description: 'Output directory (default: dist/modules)',
    },
    debug: { type: 'boolean', default: false, description: 'A dev-profile component' },
  },
  run: ({ args }) =>
    exitAfter(
      import('../commands/build').then((m) =>
        m.buildCommand({
          dirs: list(args._),
          out: text(args.out),
          profile: args.debug ? 'dev' : 'release-kmod',
        }),
      ),
    ),
});
