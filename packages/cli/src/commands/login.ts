import * as p from '@clack/prompts';
import { z } from 'zod';
import { configPath, normalizeServer, readConfig, writeConfig } from '../config';
import { DEFAULT_SERVER } from '../server';

const Login = z.object({
  token: z.string(),
  user: z.object({ email: z.string().optional(), name: z.string().optional() }).loose().optional(),
});

export interface LoginOptions {
  server?: string | undefined;
  email?: string | undefined;
  password?: string | undefined;
}

async function ask(label: string, given: string | undefined, secret: boolean): Promise<string> {
  if (given) return given;
  const answer = secret
    ? await p.password({ message: label })
    : await p.text({ message: label, validate: (v) => (v ? undefined : 'required') });
  if (p.isCancel(answer)) throw new Error('cancelled');
  return answer;
}

/** `kroma login [server]`: sign in once, keep the session token for `dev` and
 *  `install`. The account needs `settings.manage`. */
export async function loginCommand(options: LoginOptions): Promise<number> {
  const url = normalizeServer(options.server ?? process.env.KROMA_SERVER ?? DEFAULT_SERVER);
  p.intro(`sign in to ${url}`);
  const email = await ask('email or username', options.email ?? process.env.KROMA_EMAIL, false);
  const password = await ask('password', options.password ?? process.env.KROMA_PASSWORD, true);
  const res = await fetch(`${url}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login failed (${res.status}): ${(await res.text()).trim()}`);
  const { token, user } = Login.parse(await res.json());
  const config = readConfig();
  config.servers[url] = { token, user: user?.email ?? user?.name ?? email };
  config.defaultServer = url;
  writeConfig(config);
  p.outro(`signed in; token kept in ${configPath()}`);
  return 0;
}
