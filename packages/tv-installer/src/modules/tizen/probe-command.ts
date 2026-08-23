import { defineCommand } from 'citty';
import { exitAfter } from '../../exit-after';
import { style } from '../../tui/ansi';
import { connect, SDB_PORT } from './sdb';

const INTERESTING = new Set([
  'platform_version',
  'product_name',
  'model_name',
  'profile_name',
  'sdk_toolpath',
  'secure_protocol',
  'appcmd_support',
  'sdbd_rootperm',
  'syncwinsz_support',
]);

export const probeCommand = defineCommand({
  meta: {
    name: 'probe',
    description: 'Ask a Samsung set what it is over sdb, installing nothing.',
  },
  args: {
    host: { type: 'positional', required: true, description: 'The address of the set' },
  },
  run: ({ args }) => exitAfter(probe(args.host)),
});

async function probe(host: string): Promise<number> {
  const device = await connect(host).catch((error: unknown) => {
    console.error(reason(error));
    return null;
  });
  if (!device) return 1;

  try {
    console.log(`${label('banner')}${device.banner}`);
    const capability = await device.capability();
    for (const key of INTERESTING) {
      if (capability[key]) console.log(`${label(key)}${capability[key]}`);
    }
    const rest = Object.keys(capability).filter((key) => !INTERESTING.has(key));
    if (rest.length > 0) console.log(style.dim(`${label('also')}${rest.join(', ')}`));
  } finally {
    device.close();
  }
  return 0;
}

function label(name: string): string {
  return style.bold(name.padEnd(20));
}

function reason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `${message}. Nothing answered on ${SDB_PORT}: developer mode has to be on, naming this computer as the host PC, and the set rebooted since.`;
}
