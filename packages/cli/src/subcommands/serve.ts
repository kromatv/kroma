import { defineCommand } from 'citty';
import { exitAfter } from '../exit-after';
import { text } from './args';

export const serve = defineCommand({
  meta: { name: 'serve', description: 'Serve the packed bundles as a live registry to browse.' },
  args: {
    from: {
      type: 'string',
      valueHint: 'dir',
      description: 'Where the bundles are (default: dist/modules)',
    },
    port: { type: 'string', valueHint: 'port', description: 'Port (default: 4173)' },
  },
  run: ({ args }) =>
    exitAfter(
      import('../commands/serve').then((m) =>
        m.serveCommand({ from: text(args.from), port: args.port ? Number(args.port) : undefined }),
      ),
    ),
});
