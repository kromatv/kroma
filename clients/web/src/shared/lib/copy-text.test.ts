// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText } from './copy-text';

function stubClipboard(writeText: ((text: string) => Promise<void>) | null) {
  vi.stubGlobal('navigator', { clipboard: writeText ? { writeText } : undefined });
}

function stubSelectionCopy(result: boolean | Error) {
  const execCommand = vi.fn(() => {
    if (result instanceof Error) throw result;
    return result;
  });
  Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });
  return execCommand;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('copyText', () => {
  it('writes through the Clipboard API where the page has one', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    stubClipboard(writeText);
    const execCommand = stubSelectionCopy(true);

    const copied = await copyText('KROMA client 0.1.39');

    expect(copied).toBe(true);
    expect(writeText).toHaveBeenCalledWith('KROMA client 0.1.39');
    expect(execCommand).not.toHaveBeenCalled();
  });

  it('copies through the selection on plain http, where there is no Clipboard API', async () => {
    stubClipboard(null);
    const execCommand = stubSelectionCopy(true);

    const copied = await copyText('KROMA client 0.1.39');

    expect(copied).toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
  });

  it('copies through the selection when the Clipboard API refuses', async () => {
    stubClipboard(() => Promise.reject(new Error('NotAllowedError')));
    const execCommand = stubSelectionCopy(true);

    const copied = await copyText('KROMA client 0.1.39');

    expect(copied).toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
  });

  it('says so when the selection copy is refused too', async () => {
    stubClipboard(null);
    stubSelectionCopy(false);

    expect(await copyText('KROMA client 0.1.39')).toBe(false);
  });

  it('says so when the browser throws on a selection copy', async () => {
    stubClipboard(null);
    stubSelectionCopy(new Error('SecurityError'));

    expect(await copyText('KROMA client 0.1.39')).toBe(false);
  });

  it('leaves nothing behind in the page, and gives focus back', async () => {
    stubClipboard(null);
    stubSelectionCopy(true);
    const button = document.createElement('button');
    document.body.append(button);
    button.focus();

    await copyText('KROMA client 0.1.39');

    expect(document.querySelector('textarea')).toBeNull();
    expect(document.activeElement).toBe(button);
    button.remove();
  });
});
