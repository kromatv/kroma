import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { gitHub, GitHubError, unlessMissing } from './client';
import { gitHubFetch, missing, sha } from './test-support';

const Named = z.object({ name: z.string() });

const answeringNothing = async () => new Response(null, { status: 204 });

const failingBare = async () => new Response('', { status: 502, statusText: 'Bad Gateway' });

const answeringErrors = async () =>
  Response.json({ errors: [{ message: 'one' }, { message: 'two' }] });

describe('gitHub', () => {
  it('sends a write as JSON and reads the answer through its schema', async () => {
    const fetchFn = gitHubFetch({ routes: { 'POST /repos/o/r/forks': () => ({ name: 'r' }) } });

    const forked = await gitHub('Bearer t', fetchFn).send(
      { method: 'POST', path: '/repos/o/r/forks', body: { a: 1 } },
      Named,
    );

    expect(forked).toEqual({ name: 'r' });
    expect(fetchFn.calls).toEqual([{ method: 'POST', path: '/repos/o/r/forks', body: { a: 1 } }]);
  });

  it('reads an empty answer as null', async () => {
    const answered = await gitHub('Bearer t', answeringNothing).send(
      { method: 'DELETE', path: '/x' },
      z.null(),
    );

    expect(answered).toBeNull();
  });

  it('refuses with the status and the message GitHub gave', async () => {
    const fetchFn = gitHubFetch({ routes: { 'GET /repos/o/r': missing } });

    const read = gitHub('Bearer t', fetchFn).get('/repos/o/r', Named);

    await expect(read).rejects.toMatchObject({ status: 404, message: 'GET /repos/o/r: Not Found' });
  });

  it('falls back to the status text when GitHub gave no message', async () => {
    const read = gitHub('Bearer t', failingBare).get('/repos/o/r', Named);

    await expect(read).rejects.toThrow('GET /repos/o/r: Bad Gateway');
  });

  it('answers a GraphQL query with its data', async () => {
    const fetchFn = gitHubFetch({ routes: {}, blobs: { [sha('a')]: 'hello' } });

    const data = await gitHub('Bearer t', fetchFn).graphql(
      `{ b0: object(oid: "${sha('a')}") { text } }`,
      z.object({ repository: z.record(z.string(), z.unknown()) }),
    );

    expect(data.repository).toEqual({ b0: { text: 'hello' } });
  });

  it('refuses a GraphQL answer that carries errors, with every message', async () => {
    const query = gitHub('Bearer t', answeringErrors).graphql('{ x }', z.unknown());

    await expect(query).rejects.toThrow('one; two');
  });
});

describe('unlessMissing', () => {
  it('reads a 404 as nothing', async () => {
    expect(await unlessMissing(Promise.reject(new GitHubError(404, 'gone')))).toBeNull();
  });

  it('passes any other failure on', async () => {
    const failing = unlessMissing(Promise.reject(new GitHubError(500, 'down')));

    await expect(failing).rejects.toThrow('down');
  });
});
