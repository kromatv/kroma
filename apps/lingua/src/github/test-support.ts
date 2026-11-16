import type { z } from 'zod';
import { type GitHub, GitHubError } from './client';

/** One request a fake GitHub received. */
export interface Call {
  method: string;
  path: string;
  body: unknown;
}

type Handler = (body: unknown) => unknown;

/** What a fake GitHub holds: REST answers by `METHOD /path`, blob texts by oid, and blob oids by `sha:path`. */
export interface FakeRepository {
  routes: Record<string, Handler>;
  blobs?: Record<string, string>;
  paths?: Record<string, string>;
}

/** The forty-hex id `seed` names, so a test reads `sha('a')` rather than a constant. */
export function sha(seed: string): string {
  return seed.repeat(40).slice(0, 40);
}

function answer(fake: FakeRepository, call: Call): unknown {
  const handler = fake.routes[`${call.method} ${call.path}`];
  if (!handler) {
    throw new GitHubError(404, `${call.method} ${call.path}: Not Found`);
  }
  return handler(call.body);
}

function blobAliases(fake: FakeRepository, query: string): [string, unknown][] {
  return [...query.matchAll(/(b\d+): object\(oid: "([0-9a-f]{40})"\)/g)].map(
    ([, alias = '', oid = '']) => {
      const text = fake.blobs?.[oid];
      return [alias, text === undefined ? null : { text }];
    },
  );
}

function pathAliases(fake: FakeRepository, query: string): [string, unknown][] {
  return [...query.matchAll(/(p\d+): object\(expression: "([^"]+)"\)/g)].map(
    ([, alias = '', expression = '']) => {
      const oid = fake.paths?.[expression];
      return [alias, oid ? { oid } : null];
    },
  );
}

/** A GitHub answering from `fake`, 404 for any route it does not hold, recording every call. */
export function fakeGitHub(fake: FakeRepository): GitHub & { calls: Call[] } {
  const calls: Call[] = [];
  const record = (call: Call) => {
    calls.push(call);
    return answer(fake, call);
  };
  return {
    calls,
    get: async <S extends z.ZodType>(path: string, schema: S) =>
      schema.parse(record({ method: 'GET', path, body: undefined })),
    send: async (write, schema) =>
      schema.parse(record({ method: write.method, path: write.path, body: write.body })),
    async graphql(query, schema) {
      calls.push({ method: 'GRAPHQL', path: query, body: undefined });
      return schema.parse({
        repository: Object.fromEntries([...blobAliases(fake, query), ...pathAliases(fake, query)]),
      });
    },
  };
}
