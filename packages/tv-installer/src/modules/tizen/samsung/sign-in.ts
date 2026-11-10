import { createServer, type IncomingMessage, type Server } from 'node:http';
import { parseAccess, type SamsungAccess } from './access';

const SIGN_IN = 'https://account.samsung.com/mobile/account/check.do';
const SERVICE_ID = 'v285zxnl3h';
const CALLBACK_PATH = '/signin/callback';
const FIRST_PORT = 4794;
const PORTS = 20;
const TIMEOUT_MS = 300_000;
const MAX_CALLBACK_BYTES = 64 * 1024;
const LOOPBACK = '127.0.0.1';

const DONE =
  '<!doctype html><meta charset="utf-8"><title>KROMA</title><p>Signed in. Close this tab and go back to the terminal.</p>';

export interface SignInOptions {
  timeoutMs?: number;
  firstPort?: number;
}

/** The address a Samsung account signs in at, sending its answer back to `port` here. */
export function signInUrl(port: number): string {
  const back = encodeURIComponent(`http://localhost:${port}${CALLBACK_PATH}`);
  return `${SIGN_IN}?serviceID=${SERVICE_ID}&actionID=StartOAuth2&accessToken=Y&redirect_uri=${back}`;
}

/**
 * Signs a Samsung account in for a TV certificate. Listens on the loopback
 * port Samsung's own tools use, hands `open` the address to sign in at, and
 * answers what Samsung sends back once the owner has signed in.
 */
export async function signIn(
  open: (url: string) => void,
  options: SignInOptions = {},
): Promise<SamsungAccess> {
  const { timeoutMs = TIMEOUT_MS, firstPort = FIRST_PORT } = options;
  const { server, port } = await listen(firstPort);

  return new Promise<SamsungAccess>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('nobody signed in to Samsung within five minutes')),
      timeoutMs,
    );
    server.on('request', (request, response) => {
      if (!request.url?.startsWith(CALLBACK_PATH)) {
        response.writeHead(404).end();
        return;
      }
      answered(request)
        .then((access) => {
          response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(DONE);
          resolve(access);
        })
        .catch((error: unknown) => {
          response.writeHead(400).end();
          reject(error);
        })
        .finally(() => clearTimeout(timer));
    });
    open(signInUrl(port));
  }).finally(() => server.close());
}

async function listen(firstPort: number): Promise<{ server: Server; port: number }> {
  for (let port = firstPort; port < firstPort + PORTS; port++) {
    const server = createServer();
    const bound = await new Promise<boolean>((resolve) => {
      server.once('error', () => resolve(false));
      server.listen(port, LOOPBACK, () => resolve(true));
    });
    if (bound) return { server, port };
  }
  throw new Error(`no free port from ${firstPort} to ${firstPort + PORTS - 1} for the sign-in`);
}

async function answered(request: IncomingMessage): Promise<SamsungAccess> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).byteLength;
    if (size > MAX_CALLBACK_BYTES) throw new Error('the sign-in answer is far too long');
    chunks.push(chunk as Buffer);
  }
  const posted = new URLSearchParams(Buffer.concat(chunks).toString('utf8')).get('code');
  const queried = new URL(request.url ?? '', `http://${LOOPBACK}`).searchParams.get('code');
  const code = posted ?? queried;
  if (!code) throw new Error('Samsung sent no sign-in answer back');
  return parseAccess(code);
}
