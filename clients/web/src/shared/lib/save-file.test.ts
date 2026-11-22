// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveFile } from './save-file';

describe('saveFile', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clicks a link to the blob under the name it was given, then lets the blob go', () => {
    const revoke = vi.fn();
    URL.createObjectURL = vi.fn(() => 'blob:report');
    URL.revokeObjectURL = revoke;
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    saveFile(new Blob(['{}']), 'kroma-performance-24h.jsonl');

    const anchor = click.mock.contexts[0];
    expect(anchor).toBeInstanceOf(HTMLAnchorElement);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith('blob:report');
    expect(document.querySelector('a[download]')).toBeNull();
  });
});
