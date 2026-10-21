import { defineCommand } from 'citty';
import { exitAfter } from '../exit-after';
import { text } from './args';

export const release = defineCommand({
  meta: { name: 'release', description: 'Decide which packed modules publish on their own tags.' },
  args: {
    repo: {
      type: 'string',
      valueHint: 'owner/name',
      description: 'The GitHub repository (GITHUB_REPOSITORY)',
    },
    published: {
      type: 'string',
      valueHint: 'url|file',
      description: 'The live catalog to compare against',
    },
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
    'dry-run': { type: 'boolean', default: false, description: 'Decide and print, write nothing' },
    strict: {
      type: 'boolean',
      default: false,
      description: 'An unbumped changed module fails the run',
    },
  },
  run: ({ args }) =>
    exitAfter(
      import('../commands/release').then((m) =>
        m.releaseCommand({
          repo: text(args.repo),
          published: text(args.published),
          from: text(args.from),
          out: text(args.out),
          dryRun: args['dry-run'] === true,
          strict: args.strict === true,
        }),
      ),
    ),
});
