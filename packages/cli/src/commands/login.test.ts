import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  text: vi.fn(async () => 'typed@kroma.test'),
  password: vi.fn(async () => 'typed-password'),
  isCancel: (v: unknown) => typeof v === 'symbol',
}));

import * as prompts from '@clack/prompts';
import { loginCommand } from './login';

let dir: string;
let config: string;
const requests: { url: string; body: unknown }[] = [];

function stubLogin(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      requests.push({ url, body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify(body), { status });
    }),
  );
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kroma-login-'));
  config = join(dir, 'cli.json');
  requests.length = 0;
  vi.stubEnv('KROMA_CLI_CONFIG', config);
  vi.stubEnv('KROMA_SERVER', '');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

describe('loginCommand', () => {
  it('signs in with the flags and keeps the token under the server it was minted by', async () => {
    stubLogin(200, { token: 'session-token', user: { email: 'max@kroma.test' } });

    const code = await loginCommand({
      server: 'kroma.local:4040/',
      email: 'max@kroma.test',
      password: 'secret',
    });

    expect(code).toBe(0);
    expect(requests[0]?.url).toBe('http://kroma.local:4040/api/auth/login');
    expect(requests[0]?.body).toEqual({ email: 'max@kroma.test', password: 'secret' });
    expect(JSON.parse(readFileSync(config, 'utf8'))).toEqual({
      servers: { 'http://kroma.local:4040': { token: 'session-token', user: 'max@kroma.test' } },
      defaultServer: 'http://kroma.local:4040',
    });
    expect(prompts.text).not.toHaveBeenCalled();
  });

  it('asks for what the flags left out, the password without echo', async () => {
    stubLogin(200, { token: 't', user: {} });

    await loginCommand({});

    expect(prompts.text).toHaveBeenCalledTimes(1);
    expect(prompts.password).toHaveBeenCalledTimes(1);
    expect(requests[0]?.url).toBe('http://localhost:4040/api/auth/login');
    expect(requests[0]?.body).toEqual({ email: 'typed@kroma.test', password: 'typed-password' });
  });

  it("reports a refused login with the status and the server's words", async () => {
    stubLogin(401, 'bad credentials');

    await expect(loginCommand({ email: 'a', password: 'b' })).rejects.toThrow(
      'login failed (401): "bad credentials"',
    );
  });

  it('stops when the prompt is cancelled', async () => {
    vi.mocked(prompts.text).mockResolvedValueOnce(Symbol('cancel') as never);
    stubLogin(200, { token: 't' });

    await expect(loginCommand({})).rejects.toThrow('cancelled');
    expect(requests).toHaveLength(0);
  });
});
