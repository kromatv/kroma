import { expect } from 'vitest';
import type { KromaClient } from './kroma-client';
import { BEARER, recordRequest } from './kroma-client.fixture';

/** One endpoint of a domain, as a row of that domain's route table. */
export interface Endpoint {
  readonly name: string;
  readonly call: (client: KromaClient) => unknown;
  readonly method: string;
  readonly path: string;
  readonly body?: unknown;
  readonly auth?: 'public';
}

/** Checks the request one endpoint makes: the verb, `path` (what follows `/api`,
 * encoded), the bearer every row but a `public` one carries, and `body` where
 * the row states one. Fed to `it.each` over a domain's table. */
export async function checkEndpoint({ call, method, path, body, auth }: Endpoint): Promise<void> {
  const recorded = await recordRequest(call);

  expect(recorded.method).toBe(method);
  expect(recorded.path).toBe(path);
  expect(recorded.headers.get('Authorization')).toBe(auth === 'public' ? null : `Bearer ${BEARER}`);
  if (body !== undefined) expect(recorded.body).toEqual(body);
}
