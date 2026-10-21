import { defineCommand } from 'citty';
import { exitAfter } from '../exit-after';
import { text } from './args';

export const registry = defineCommand({
  meta: {
    name: 'registry',
    description: 'Write the packed bundles as a static registry for any host.',
  },
  args: {
    from: {
      type: 'string',
      valueHint: 'dir',
      description: 'Where the bundles are (default: dist/modules)',
    },
    out: {
      type: 'string',
      valueHint: 'dir',
      description: 'Output directory (default: dist/registry)',
    },
    base: {
      type: 'string',
      valueHint: 'url',
      description: 'The URL the registry will be served at',
    },
  },
  run: ({ args }) =>
    exitAfter(
      import('../commands/registry').then((m) =>
        m.registryCommand({ from: text(args.from), out: text(args.out), base: text(args.base) }),
      ),
    ),
});
