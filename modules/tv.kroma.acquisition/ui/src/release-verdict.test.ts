import { describe, expect, it } from 'vitest';
import { reasonKey, verdictLabelKey, verdictReasonKey, verdictTone } from './release-verdict';

describe('verdictLabelKey', () => {
  it('names each of the four things a grab can do', () => {
    expect(verdictLabelKey({ kind: 'fill' })).toBe('acq.verdict.fill');
    expect(verdictLabelKey({ kind: 'upgrade', reason: 'quality' })).toBe('acq.verdict.upgrade');
    expect(verdictLabelKey({ kind: 'beside', reason: 'formats' })).toBe('acq.verdict.beside');
    expect(verdictLabelKey({ kind: 'notBetter', reason: 'cutoffReached' })).toBe(
      'acq.verdict.notBetter',
    );
  });
});

describe('verdictReasonKey', () => {
  it('reads the reason behind every verdict but the one that has none', () => {
    expect(verdictReasonKey({ kind: 'fill' })).toBeNull();
    expect(verdictReasonKey({ kind: 'notBetter', reason: 'lowerQuality' })).toBe(
      'acq.reason.lowerQuality',
    );
  });
});

describe('reasonKey', () => {
  it('keys a reason under the module catalog', () => {
    expect(reasonKey('noBetterFormats')).toBe('acq.reason.noBetterFormats');
  });
});

describe('verdictTone', () => {
  it('draws a grab worth making apart from one that is not', () => {
    expect(verdictTone({ kind: 'fill' })).toBe('success');
    expect(verdictTone({ kind: 'upgrade', reason: 'formats' })).toBe('accentText');
    expect(verdictTone({ kind: 'beside', reason: 'formats' })).toBe('info');
    expect(verdictTone({ kind: 'notBetter', reason: 'upgradesOff' })).toBe('textDim');
  });
});
