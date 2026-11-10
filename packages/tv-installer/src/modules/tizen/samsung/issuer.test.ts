import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { issueAuthor, issueDistributor } from './issuer';
import { LISTED_CERTIFICATE } from './listed.fixture';

const access = { accessToken: 'token-123', userId: 'user-456', email: 'owner@example.com' };
const CSR = '-----BEGIN CERTIFICATE REQUEST-----\nMIIB\n-----END CERTIFICATE REQUEST-----\n';

interface Asked {
  url: string;
  fields: Record<string, string>;
  file: { name: string; text: string };
}

const asked: Asked[] = [];
const answers: Response[] = [];

beforeEach(() => {
  asked.length = 0;
  answers.length = 0;
  vi.stubGlobal('fetch', async (url: string, init: { body: FormData }) => {
    const csr = init.body.get('csr') as File;
    const fields: Record<string, string> = {};
    for (const [name, value] of init.body) if (typeof value === 'string') fields[name] = value;
    asked.push({ url, fields, file: { name: csr.name, text: await csr.text() } });
    return answers.shift() ?? new Response(LISTED_CERTIFICATE);
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('issueAuthor', () => {
  it('sends the request to the author service, for a television', async () => {
    await issueAuthor(access, CSR);

    expect(asked).toEqual([
      {
        url: 'https://svdca.samsungqbe.com/apis/v3/authors',
        fields: { access_token: 'token-123', user_id: 'user-456', platform: 'VD' },
        file: { name: 'author.csr', text: CSR },
      },
    ]);
  });

  it('answers the certificate Samsung issued, ending in one newline', async () => {
    answers.push(new Response(`\n${LISTED_CERTIFICATE}\n\n`));

    expect(await issueAuthor(access, CSR)).toBe(LISTED_CERTIFICATE);
  });

  it('says so when Samsung holds requests back', async () => {
    answers.push(new Response('Forbidden', { status: 403 }));

    await expect(issueAuthor(access, CSR)).rejects.toThrow(
      'Samsung is holding certificate requests back for now: try again in a while',
    );
  });

  it('quotes what Samsung said when it refused the request', async () => {
    answers.push(new Response('{"error":"invalid access_token"}', { status: 401 }));

    await expect(issueAuthor(access, CSR)).rejects.toThrow(
      'Samsung answered 401 to the request: {"error":"invalid access_token"}',
    );
  });

  it('refuses an answer with nothing in it', async () => {
    answers.push(new Response(''));

    await expect(issueAuthor(access, CSR)).rejects.toThrow('Samsung answered 200 to the request');
  });

  it('refuses an answer that is no certificate', async () => {
    answers.push(new Response('<html>maintenance</html>'));

    await expect(issueAuthor(access, CSR)).rejects.toThrow(
      'Samsung answered the author request with something that is no certificate',
    );
  });
});

describe('issueDistributor', () => {
  it('registers the sets first, then asks for the certificate', async () => {
    answers.push(new Response('<Profile />'), new Response(LISTED_CERTIFICATE));

    await issueDistributor(access, CSR);

    expect(asked.map(({ url }) => url)).toEqual([
      'https://svdca.samsungqbe.com/apis/v1/distributors',
      'https://svdca.samsungqbe.com/apis/v3/distributors',
    ]);
  });

  it('asks for the Public privilege, naming the television only to the first service', async () => {
    answers.push(new Response('<Profile />'), new Response(LISTED_CERTIFICATE));

    await issueDistributor(access, CSR);

    const level = { privilege_level: 'Public', developer_type: 'Individual' };
    const account = { access_token: 'token-123', user_id: 'user-456' };
    expect(asked[0]?.fields).toEqual({ ...account, ...level, platform: 'VD' });
    expect(asked[1]?.fields).toEqual({ ...account, ...level });
    expect(asked[1]?.file).toEqual({ name: 'distributor.csr', text: CSR });
  });

  it('answers the certificate and the device profile Samsung registered', async () => {
    answers.push(new Response('<Profile><TestDevice>1900A2C4D6E8</TestDevice></Profile>'));

    expect(await issueDistributor(access, CSR)).toEqual({
      certificate: LISTED_CERTIFICATE,
      deviceProfile: '<Profile><TestDevice>1900A2C4D6E8</TestDevice></Profile>',
    });
  });

  it('refuses a second answer that is no certificate', async () => {
    answers.push(new Response('<Profile />'), new Response('<Profile />'));

    await expect(issueDistributor(access, CSR)).rejects.toThrow(
      'Samsung answered the distributor request with something that is no certificate',
    );
  });
});
