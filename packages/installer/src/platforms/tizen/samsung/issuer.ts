import { X509Certificate } from 'node:crypto';
import type { SamsungAccess } from './access';

const SERVICE = 'https://svdca.samsungqbe.com/apis';
const AUTHORS = `${SERVICE}/v3/authors`;
const DEVICE_PROFILES = `${SERVICE}/v1/distributors`;
const DISTRIBUTORS = `${SERVICE}/v3/distributors`;
const TV = 'VD';
const RATE_LIMITED = 403;
const TIMEOUT_MS = 60_000;
const MAX_ANSWER_CHARS = 64 * 1024;

interface Fields {
  access: SamsungAccess;
  csr: string;
  file: string;
  extra: Readonly<Record<string, string>>;
}

function form({ access, csr, file, extra }: Fields): FormData {
  const body = new FormData();
  body.set('access_token', access.accessToken);
  body.set('user_id', access.userId);
  for (const [name, value] of Object.entries(extra)) body.set(name, value);
  body.set('csr', new Blob([csr], { type: 'application/octet-stream' }), file);
  return body;
}

async function post(url: string, body: FormData): Promise<string> {
  const response = await fetch(url, {
    method: 'POST',
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const answer = (await response.text()).slice(0, MAX_ANSWER_CHARS).trim();
  if (response.status === RATE_LIMITED) {
    throw new Error('Samsung is holding certificate requests back for now: try again in a while');
  }
  if (!response.ok || answer === '') {
    throw new Error(`Samsung answered ${response.status} to the request: ${answer.slice(0, 200)}`);
  }
  return answer;
}

function certificate(pem: string, kind: string): string {
  try {
    new X509Certificate(pem);
  } catch {
    throw new Error(`Samsung answered the ${kind} request with something that is no certificate`);
  }
  return `${pem}\n`;
}

/** Asks Samsung to issue a TV author certificate for the request, as PEM. */
export async function issueAuthor(access: SamsungAccess, csr: string): Promise<string> {
  const body = form({ access, csr, file: 'author.csr', extra: { platform: TV } });
  return certificate(await post(AUTHORS, body), 'author');
}

export interface IssuedDistributor {
  certificate: string;
  deviceProfile: string;
}

/**
 * Asks Samsung to issue a Public distributor certificate for the request. The
 * devices it names are registered with the account first, which answers the
 * device profile, and the certificate is asked for second, as Samsung's own
 * tools do.
 */
export async function issueDistributor(
  access: SamsungAccess,
  csr: string,
): Promise<IssuedDistributor> {
  const level = { privilege_level: 'Public', developer_type: 'Individual' };
  const file = 'distributor.csr';
  const deviceProfile = await post(
    DEVICE_PROFILES,
    form({ access, csr, file, extra: { ...level, platform: TV } }),
  );
  const pem = await post(DISTRIBUTORS, form({ access, csr, file, extra: level }));
  return { certificate: certificate(pem, 'distributor'), deviceProfile };
}
