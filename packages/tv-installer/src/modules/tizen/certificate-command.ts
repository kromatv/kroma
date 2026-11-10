import { defineCommand } from 'citty';
import { exitAfter } from '../../exit-after';
import { run } from '../../run';
import { style } from '../../tui/ansi';
import { duidOf } from './duid';
import { reach } from './reach';
import { requestCertificates } from './samsung/request';
import { signIn } from './samsung/sign-in';

const BROWSER: Partial<Record<NodeJS.Platform, string>> = { darwin: 'open', linux: 'xdg-open' };

export const certificateCommand = defineCommand({
  meta: {
    name: 'certificate',
    description:
      "Get Samsung's certificates for a set: sign in to Samsung once, and every install signs with them.",
  },
  args: {
    host: { type: 'positional', required: true, description: 'The address of the Samsung set' },
  },
  run: ({ args }) => exitAfter(certificate(args.host)),
});

async function readDuid(host: string): Promise<string> {
  const device = await reach(host);
  try {
    const duid = await duidOf(device);
    if (!duid) throw new Error(`${host} would not say its DUID`);
    return duid;
  } finally {
    device.close();
  }
}

function openBrowser(url: string): void {
  console.log(`Sign in to your Samsung account in the browser. If none opened, go to:\n${url}`);
  const opener = BROWSER[process.platform];
  if (opener) run([opener, url]).catch(() => undefined);
}

/**
 * Reads the DUID off the set, signs the owner in to Samsung, and has Samsung
 * issue the author and the distributor certificate that set takes.
 */
async function certificate(host: string): Promise<number> {
  const duid = await readDuid(host);
  console.log(`${style.green('set')}          ${host}, DUID ${duid}`);

  const access = await signIn(openBrowser);
  const obtained = await requestCertificates({
    access,
    duid,
    log: (line) => console.log(style.dim(line)),
  });

  const day = (date: Date) => date.toISOString().slice(0, 10);
  console.log(`${style.green('kept in')}      ${obtained.directory}`);
  console.log(`${style.green('sets')}         ${obtained.duids.join(', ')}`);
  console.log(`${style.green('author')}       valid until ${day(obtained.authorUntil)}`);
  console.log(`${style.green('distributor')}  valid until ${day(obtained.distributorUntil)}`);
  return 0;
}
