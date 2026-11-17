import { describe, expect, it } from 'vitest';
import { reader } from './reader';
import { gitHubFetch, sha } from './test-support';

const OAUTH = { clientId: 'cid', clientSecret: 'csecret' };

const repository = () =>
  gitHubFetch({
    routes: {
      'GET /repos/o/r': () => ({ default_branch: 'trunk' }),
      'GET /repos/o/r/pulls/7': () => ({ state: 'closed', merged: true }),
      'GET /repos/o/r/commits/feat%2Flingua': () =>
        new Response(`${sha('a')}\n`, { headers: { etag: 'W/"e1"' } }),
      [`GET /o/r/${sha('a')}/loc/en/a%20b.json`]: () => new Response('{"k":"v"}'),
    },
  });

describe('reader', () => {
  it('sends the OAuth App’s client id and secret as HTTP Basic to the API', async () => {
    const fetchFn = repository();

    await reader({ oauth: OAUTH, requests: 5 }, fetchFn).defaultBranch('o/r');

    expect(fetchFn.headers[0]?.get('authorization')).toBe(`Basic ${btoa('cid:csecret')}`);
  });

  it('reads the API anonymously without OAuth credentials', async () => {
    const fetchFn = repository();

    const branch = await reader({ oauth: null, requests: 5 }, fetchFn).defaultBranch('o/r');

    expect(branch).toBe('trunk');
    expect(fetchFn.headers[0]?.has('authorization')).toBe(false);
  });

  it('reads where a branch points, with the ETag GitHub sent', async () => {
    const head = await reader({ oauth: null, requests: 5 }, repository()).branchHead(
      'o/r',
      'feat/lingua',
      null,
    );

    expect(head).toEqual({ sha: sha('a'), etag: 'W/"e1"' });
  });

  it('answers the known head when GitHub says the branch has not moved', async () => {
    const since = { sha: sha('b'), etag: '"e0"' };
    const fetchFn = gitHubFetch({
      routes: { 'GET /repos/o/r/commits/main': () => new Response(null, { status: 304 }) },
    });

    const head = await reader({ oauth: null, requests: 5 }, fetchFn).branchHead(
      'o/r',
      'main',
      since,
    );

    expect(head).toBe(since);
    expect(fetchFn.headers[0]?.get('if-none-match')).toBe('"e0"');
  });

  it('refuses a branch GitHub does not know, with its message', async () => {
    const read = reader({ oauth: null, requests: 5 }, repository()).branchHead('o/r', 'gone', null);

    await expect(read).rejects.toMatchObject({ status: 404 });
  });

  it('reads a file at a commit from raw.githubusercontent.com, its path escaped', async () => {
    const fetchFn = repository();

    const text = await reader({ oauth: OAUTH, requests: 5 }, fetchFn).text(
      'o/r',
      sha('a'),
      'loc/en/a b.json',
    );

    expect(text).toBe('{"k":"v"}');
    expect(fetchFn.headers[0]?.has('authorization')).toBe(false);
  });

  it('refuses a file the commit does not hold', async () => {
    const read = reader({ oauth: null, requests: 5 }, repository()).text('o/r', sha('a'), 'nope');

    await expect(read).rejects.toMatchObject({ status: 404 });
  });

  it('reads a merged pull request as closed, and counts every request it made', async () => {
    const read = reader({ oauth: null, requests: 5 }, repository());

    const state = await read.pullState('o/r', 7);

    expect(state).toBe('closed');
    expect(read.left).toBe(4);
  });
});
