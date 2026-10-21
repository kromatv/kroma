import { defineCommand } from 'citty';
import { exitAfter } from '../exit-after';
import { dirsArg, list, text } from './args';

export const plan = defineCommand({
  meta: {
    name: 'plan',
    description: 'Print the cargo build lines CI runs in its cross-compile container.',
  },
  args: {
    dirs: dirsArg,
    target: { type: 'string', valueHint: 'triple', description: 'The Rust target (KMOD_TARGET)' },
  },
  run: ({ args }) =>
    exitAfter(
      import('../commands/plan').then((m) => m.planCommand(list(args._), text(args.target))),
    ),
});
