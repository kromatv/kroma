import { defineCommand } from 'citty';
import { exitAfter } from '../exit-after';
import { dirsArg, list } from './args';

export const audit = defineCommand({
  meta: {
    name: 'audit',
    description:
      'Start a module alone, let nothing out, and print what it attempted beside what it declares.',
  },
  args: {
    dirs: dirsArg,
    json: { type: 'boolean', default: false, description: 'One JSON document per module' },
  },
  run: ({ args }) =>
    exitAfter(
      import('../commands/audit').then((m) =>
        m.auditCommand({ dirs: list(args._), json: args.json === true }),
      ),
    ),
});
