import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tool } from './detect';
import { download, installTool } from './install';

const locate = vi.hoisted(() => vi.fn((_tool: unknown): string | null => null));
vi.mock('./detect', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  locate,
}));

const lines: string[] = [];
const log = (line: string) => lines.push(line);

const install = vi.fn(async () => {});

const adb: Tool = {
  id: 'adb',
  label: 'Android Debug Bridge',
  binary: 'adb',
  source: 'dl.google.com platform-tools',
  install,
};

const xcode: Tool = {
  id: 'xcode',
  label: 'Xcode',
  binary: 'xcodebuild',
  source: 'the Mac App Store',
};

beforeEach(() => {
  lines.length = 0;
  locate.mockReset();
  install.mockClear();
});

describe('installTool', () => {
  it('hands back the path of a tool that is already here without installing it', async () => {
    locate.mockReturnValue('/usr/local/bin/adb');

    const path = await installTool(adb, log);

    expect(path).toBe('/usr/local/bin/adb');
    expect(install).not.toHaveBeenCalled();
  });

  it('installs a missing tool and answers where it landed', async () => {
    locate.mockReturnValueOnce(null).mockReturnValueOnce('/home/.kroma/tools/adb');

    const path = await installTool(adb, log);

    expect(install).toHaveBeenCalledOnce();
    expect(path).toBe('/home/.kroma/tools/adb');
  });

  it('names the source of a missing tool it cannot install itself', async () => {
    locate.mockReturnValue(null);

    await expect(installTool(xcode, log)).rejects.toThrow(
      'Xcode is missing: install it from the Mac App Store',
    );
  });

  it('refuses an install that left nothing the shell can find', async () => {
    locate.mockReturnValue(null);

    await expect(installTool(adb, log)).rejects.toThrow(
      'Android Debug Bridge installed but adb is not on PATH',
    );
  });

  it('says what it is installing and where it put it', async () => {
    locate.mockReturnValueOnce(null).mockReturnValueOnce('/home/.kroma/tools/adb');

    await installTool(adb, log);

    expect(lines).toEqual([
      'installing Android Debug Bridge from dl.google.com platform-tools',
      'Android Debug Bridge ready: /home/.kroma/tools/adb',
    ]);
  });
});

const chunks: Uint8Array[] = [];
const sink = { write: (chunk: Uint8Array) => chunks.push(chunk), end: async () => {} };
vi.stubGlobal('Bun', { file: () => ({ writer: () => sink }) });

const body = (count: number) =>
  (async function* stream() {
    for (let index = 0; index < count; index++) yield new Uint8Array(10);
  })();

const answering = (response: unknown) => vi.stubGlobal('fetch', async () => response);

describe('download', () => {
  beforeEach(() => {
    chunks.length = 0;
    lines.length = 0;
  });

  it('writes every chunk the server sent', async () => {
    answering({ ok: true, body: body(3), headers: new Headers({ 'content-length': '30' }) });

    await download('https://dl.google.com/platform-tools.zip', '/tmp/tools.zip', log);

    expect(chunks).toHaveLength(3);
  });

  it('reports how far the download has got, in tens', async () => {
    answering({ ok: true, body: body(10), headers: new Headers({ 'content-length': '100' }) });

    await download('https://dl.google.com/platform-tools.zip', '/tmp/tools.zip', log);

    expect(lines).toEqual([
      '  10% of 0 MB',
      '  20% of 0 MB',
      '  30% of 0 MB',
      '  40% of 0 MB',
      '  50% of 0 MB',
      '  60% of 0 MB',
      '  70% of 0 MB',
      '  80% of 0 MB',
      '  90% of 0 MB',
      '  100% of 0 MB',
    ]);
  });

  it('says nothing about progress when the server named no length', async () => {
    answering({ ok: true, body: body(3), headers: new Headers() });

    await download('https://dl.google.com/platform-tools.zip', '/tmp/tools.zip', log);

    expect(lines).toEqual([]);
  });

  it('refuses a URL the server would not serve', async () => {
    answering({ ok: false, status: 404, body: null, headers: new Headers() });

    await expect(download('https://dl.google.com/gone.zip', '/tmp/tools.zip', log)).rejects.toThrow(
      'GET https://dl.google.com/gone.zip answered 404',
    );
  });
});
