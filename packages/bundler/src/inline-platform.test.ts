import { describe, expect, it } from 'vitest';
import { inlinePlatformConst } from './inline-platform.cjs';

const KIT_FILE = `import { View } from 'react-native';
import { WEB } from '#ui/lib/platform';

export function thing() {
  if (WEB) return 'browser';
  return 'television';
}
`;

describe('inlinePlatformConst', () => {
  it('collapses the import to false on a native platform', () => {
    const out = inlinePlatformConst(KIT_FILE, 'ios');

    expect(out).toContain('const WEB = false;');
    expect(out).not.toContain('#ui/lib/platform');
  });

  it('collapses it to true on web', () => {
    expect(inlinePlatformConst(KIT_FILE, 'web')).toContain('const WEB = true;');
  });

  it('keeps the line count, so source maps stay honest', () => {
    const out = inlinePlatformConst(KIT_FILE, 'android');

    expect(out.split('\n')).toHaveLength(KIT_FILE.split('\n').length);
  });

  it('reads the double-quote and no-semicolon spellings too', () => {
    expect(inlinePlatformConst(`import {WEB} from "#ui/lib/platform"\n`, 'ios')).toBe(
      'const WEB = false;\n',
    );
  });

  it('leaves a file with no platform import exactly as it was', () => {
    const src = `import { Platform } from 'react-native';\n`;

    expect(inlinePlatformConst(src, 'ios')).toBe(src);
  });
});
