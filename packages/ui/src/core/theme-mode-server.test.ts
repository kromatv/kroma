import { describe, expect, it } from 'vitest';
import { createStyleTestHost } from '#ui/testing-style';

import { readMode } from './theme-mode';

const styleHost = createStyleTestHost();
const { themeVersion, writeMode } = styleHost;

describe('the ground where the web platform has no document', () => {
  it('reads system when there is no jar to read and none was handed over', () => {
    expect(readMode()).toBe('system');
  });

  it('writes nothing, since a render on the server has no visitor to store a choice on', () => {
    const before = themeVersion();
    expect(() => writeMode('light')).not.toThrow();
    expect(readMode()).toBe('system');
    expect(themeVersion()).toBe(before);
  });
});
