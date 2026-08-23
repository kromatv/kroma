import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { OPENSSL } from './openssl';
import { randomPassword } from './password';
import type { ProfileKey } from './profile';

const RSA = ['-newkey', 'rsa:2048', '-nodes'];
const ONE_DAY = ['-days', '1'];
const subject = (name: string) => ['-subj', `/CN=${name}/O=KROMA/C=CH`];

function openssl(args: string[]): void {
  const result = spawnSync(OPENSSL, args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`openssl ${args[0]}: ${result.stderr ?? result.error}`);
}

/**
 * A PKCS#12 written under `directory`, holding a throwaway key and the throwaway
 * authority that issued it, so the chain is two deep as a Samsung one is.
 */
export function writeArchive(directory: string, name: string): ProfileKey {
  const at = (suffix: string) => join(directory, `${name}.${suffix}`);
  const password = randomPassword();

  openssl([
    'req',
    '-x509',
    ...RSA,
    ...ONE_DAY,
    '-keyout',
    at('ca.key'),
    '-out',
    at('ca.crt'),
    ...subject(`${name} authority`),
  ]);
  openssl(['req', ...RSA, '-keyout', at('key'), '-out', at('csr'), ...subject(name)]);
  openssl([
    'x509',
    '-req',
    ...ONE_DAY,
    '-in',
    at('csr'),
    '-CA',
    at('ca.crt'),
    '-CAkey',
    at('ca.key'),
    '-CAcreateserial',
    '-out',
    at('crt'),
  ]);
  openssl([
    'pkcs12',
    '-export',
    '-inkey',
    at('key'),
    '-in',
    at('crt'),
    '-certfile',
    at('ca.crt'),
    '-out',
    at('p12'),
    '-passout',
    `pass:${password}`,
  ]);

  return { archive: at('p12'), password };
}
