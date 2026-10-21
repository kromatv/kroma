import { defineCommand } from 'citty';
import { exitAfter } from '../exit-after';
import { dirsArg, list, text } from './args';

export const build = defineCommand({
  meta: {
    name: 'build',
    description: 'Pack the installable .kmod: the sidecar, the frontend, the manifest.',
  },
  args: {
    dirs: dirsArg,
    out: {
      type: 'string',
      valueHint: 'dir',
      description: 'Output directory (default: dist/modules)',
    },
    target: {
      type: 'string',
      valueHint: 'triple',
      description: 'Cross-compile for this Rust target (KMOD_TARGET)',
    },
    debug: { type: 'boolean', default: false, description: 'A dev-profile sidecar' },
    'skip-build': {
      type: 'boolean',
      default: false,
      description: 'Pack a binary built out of band (KMOD_SKIP_BUILD)',
    },
  },
  run: ({ args }) =>
    exitAfter(
      import('../commands/build').then((m) =>
        m.buildCommand({
          dirs: list(args._),
          out: text(args.out),
          target: text(args.target),
          profile: args.debug ? 'dev' : 'release-kmod',
          skipBuild: args['skip-build'] || undefined,
        }),
      ),
    ),
});
