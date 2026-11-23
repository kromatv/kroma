import { defineCommand } from 'citty';
import { exitAfter } from '../exit-after';
import { text } from './args';

export const perf = defineCommand({
  meta: {
    name: 'perf',
    description: "Download what the server's profiler measured, one JSON record per line.",
  },
  args: {
    window: { type: 'string', description: '1h, 24h (default), 7d or 30d' },
    format: { type: 'string', description: 'jsonl (default) or md' },
    out: { type: 'string', description: 'Write here instead of the standard output' },
    server: {
      type: 'string',
      description: 'The server URL (KROMA_SERVER, else the last `kroma login`)',
    },
    token: { type: 'string', description: 'A session token (KROMA_TOKEN)' },
  },
  run: ({ args }) =>
    exitAfter(
      import('../commands/perf').then((m) =>
        m.perfCommand({
          window: text(args.window),
          format: text(args.format),
          out: text(args.out),
          server: text(args.server),
          token: text(args.token),
        }),
      ),
    ),
});
