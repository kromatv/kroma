import { defineCommand } from 'citty';
import { exitAfter } from '../exit-after';
import { text } from './args';

export const create = defineCommand({
  meta: {
    name: 'create',
    description: 'Scaffold a module: a few questions, then a project ready for `kroma dev`.',
  },
  args: {
    dir: {
      type: 'positional',
      required: false,
      description: 'Where to put it (defaults to the module id)',
    },
    id: { type: 'string', valueHint: 'tv.acme.notes', description: 'The module id' },
    name: { type: 'string', description: 'Display name' },
    description: { type: 'string', description: 'One line about the module' },
    kind: {
      type: 'string',
      valueHint: 'full|server|ui',
      description: 'A page and a sidecar, a sidecar, or a page',
    },
    storage: { type: 'boolean', description: 'The sidecar keeps its own database' },
    'in-repo': {
      type: 'boolean',
      description: 'Path deps into this checkout (the default inside it)',
    },
    install: {
      type: 'boolean',
      default: true,
      description: 'Run bun install afterwards',
      negativeDescription: 'Skip bun install',
    },
    yes: { type: 'boolean', default: false, description: 'Take every default, ask nothing' },
  },
  run: ({ args }) =>
    exitAfter(
      import('../commands/create').then((m) =>
        m.createCommand({
          dir: text(args.dir),
          id: text(args.id),
          name: text(args.name),
          description: text(args.description),
          kind: text(args.kind),
          storage: typeof args.storage === 'boolean' ? args.storage : undefined,
          inRepo: typeof args['in-repo'] === 'boolean' ? args['in-repo'] : undefined,
          install: args.install !== false,
          yes: args.yes === true,
        }),
      ),
    ),
});
