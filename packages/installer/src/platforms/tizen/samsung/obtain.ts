import { type LogLine, run } from '../../../shared/run';
import { type Obtained, requestCertificates } from './request';
import { signIn } from './sign-in';

const BROWSER: Partial<Record<NodeJS.Platform, string>> = { darwin: 'open', linux: 'xdg-open' };

export interface CertificateWish {
  duid: string;
  log: LogLine;
}

/**
 * Signs the owner in to Samsung in their browser, then has Samsung issue the
 * certificates of a set and keeps them. The sign-in address is logged as well
 * as opened, for a machine whose browser did not come up.
 */
export async function obtainCertificates({ duid, log }: CertificateWish): Promise<Obtained> {
  const access = await signIn((url) => {
    log(`sign in to your Samsung account in the browser. If none opened, go to: ${url}`);
    const opener = BROWSER[process.platform];
    if (opener) run([opener, url]).catch(() => undefined);
  });
  return requestCertificates({ access, duid, log });
}
