import { defineCommand } from 'citty';
import { exitAfter } from '../exit-after';

export const cargo = defineCommand({
  meta: { name: 'cargo', description: 'Run one cargo subcommand in every module workspace.' },
  args: {
    args: {
      type: 'positional',
      required: true,
      description: 'The cargo subcommand and its arguments',
    },
  },
  run: ({ rawArgs }) =>
    exitAfter(
      import('../commands/cargo').then((m) => m.cargoCommand(rawArgs.filter((a) => a !== '--'))),
    ),
});
