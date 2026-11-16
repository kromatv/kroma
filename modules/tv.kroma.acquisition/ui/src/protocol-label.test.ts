import { describe, expect, it } from 'vitest';
import { protocolLabel } from './protocol-label';

const catalog: Record<string, string> = { 'protocol.usenet': 'Usenet' };
const t = (key: string) => catalog[key] ?? key;

describe('protocolLabel', () => {
  it('names a protocol by its catalog label', () => {
    expect(protocolLabel(t, 'usenet')).toBe('Usenet');
  });

  it('names a protocol the catalog does not know by its own name', () => {
    expect(protocolLabel(t, 'ed2k')).toBe('ed2k');
  });
});
