import { defineCommand } from 'citty';
import { exitAfter } from '../exit-after';
import { serverArgs, text } from './args';

export const install = defineCommand({
  meta: { name: 'install', description: 'Upload a packed .kmod to a running server.' },
  args: {
    id: {
      type: 'positional',
      required: false,
      description: 'The module id (default: this module)',
    },
    file: { type: 'string', valueHint: 'path', description: 'A .kmod to upload instead' },
    from: {
      type: 'string',
      valueHint: 'dir',
      description: 'Where the bundles are (default: dist/modules)',
    },
    ...serverArgs,
  },
  run: ({ args }) =>
    exitAfter(
      import('../commands/install').then((m) =>
        m.installCommand({
          id: text(args.id),
          file: text(args.file),
          from: text(args.from),
          server: text(args.server),
          token: text(args.token),
        }),
      ),
    ),
});
