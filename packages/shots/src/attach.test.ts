import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { attach, type AttachContext } from './attach';

const ASSET = 'https://github.com/user-attachments/assets/2b1e0c4e-5f0a-4c55-9d8e-3c1f4a6b7d90';

function fixture(name: string): string {
  const file = join(mkdtempSync(join(tmpdir(), 'kroma-attach-')), name);
  writeFileSync(file, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  return file;
}

function contextAnswering(status: number, body: unknown, seen: Request[] = []): AttachContext {
  return {
    repositoryId: '1282571532',
    token: 'gho_test',
    fetch: async (url, init) => {
      seen.push(new Request(url, init));
      return Response.json(body, { status });
    },
  };
}

describe('attach', () => {
  it('posts the file to the attachments endpoint and returns the url GitHub answers with', async () => {
    const seen: Request[] = [];
    const file = fixture('hero before.png');

    const url = await attach(file, contextAnswering(201, { url: ASSET }, seen));

    const [request] = seen;
    const query = new URL(request?.url ?? '').searchParams;
    expect(url).toBe(ASSET);
    expect(request?.method).toBe('POST');
    expect(new URL(request?.url ?? '').origin).toBe('https://uploads.github.com');
    expect(query.get('name')).toBe('hero before.png');
    expect(query.get('content_type')).toBe('image/png');
    expect(query.get('repository_id')).toBe('1282571532');
    expect(request?.headers.get('authorization')).toBe('Bearer gho_test');
    expect(request?.headers.get('content-type')).toBe('image/png');
  });

  it('refuses a file the endpoint only takes as an image or a video', async () => {
    const file = fixture('report.pdf');

    await expect(attach(file, contextAnswering(201, { url: ASSET }))).rejects.toThrow(
      /images and video/,
    );
  });

  it('names the status GitHub refused with', async () => {
    const file = fixture('shot.png');

    await expect(attach(file, contextAnswering(404, { message: 'Not Found' }))).rejects.toThrow(
      /404/,
    );
  });

  it('rejects an answer that carries no attachment url', async () => {
    const file = fixture('shot.png');

    await expect(attach(file, contextAnswering(201, { id: 7 }))).rejects.toThrow();
  });
});
