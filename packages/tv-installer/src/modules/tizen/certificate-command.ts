import { defineCommand } from 'citty';
import { exitAfter } from '../../exit-after';
import { style } from '../../tui/ansi';
import { duidAt } from './duid';
import { obtainCertificates } from './samsung/obtain';

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

/**
 * Reads the DUID off the set, signs the owner in to Samsung, and has Samsung
 * issue the author and the distributor certificate that set takes.
 */
async function certificate(host: string): Promise<number> {
  const duid = await duidAt(host);
  if (!duid) throw new Error(`${host} would not say its DUID`);
  console.log(`${style.green('set')}          ${host}, DUID ${duid}`);

  const obtained = await obtainCertificates({ duid, log: (line) => console.log(style.dim(line)) });

  const day = (date: Date) => date.toISOString().slice(0, 10);
  console.log(`${style.green('kept in')}      ${obtained.directory}`);
  console.log(`${style.green('sets')}         ${obtained.duids.join(', ')}`);
  console.log(`${style.green('author')}       valid until ${day(obtained.authorUntil)}`);
  console.log(`${style.green('distributor')}  valid until ${day(obtained.distributorUntil)}`);
  return 0;
}
