import { describe, expect, it } from 'vitest';
import { StoreModule } from './store';

const ENTRY = {
  id: 'tv.kroma.acquisition',
  name: 'Acquisition',
  version: '0.4.1',
  description: '',
  library: false,
  engines: {},
  dependencies: {},
  optionalDependencies: {},
  contributes: [],
  consumes: [],
  updateAvailable: false,
  compatible: false,
  reason: 'requires a future thing',
  source: 'Official',
};

describe('StoreModule', () => {
  it('reads a refusal kind it does not know as no refusal, keeping the reason', () => {
    const entry = { ...ENTRY, refusal: { kind: 'quantum', flux: 3 } };

    const parsed = StoreModule.parse(entry);

    expect(parsed.refusal).toBeNull();
    expect(parsed.reason).toBe('requires a future thing');
  });

  it('keeps a refusal kind it knows', () => {
    const entry = { ...ENTRY, refusal: { kind: 'platform', target: 'x86_64' } };

    const parsed = StoreModule.parse(entry);

    expect(parsed.refusal).toEqual({ kind: 'platform', target: 'x86_64' });
  });
});
