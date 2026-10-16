import { describe, expect, it } from 'vitest';
import { factLabel } from './fact-labels';

describe('factLabel', () => {
  it('writes a wire name the way a release name does', () => {
    expect(factLabel('R1080')).toBe('1080p');
    expect(factLabel('WebDl')).toBe('WEB-DL');
    expect(factLabel('dolbyVision')).toBe('Dolby Vision');
  });

  it('leaves a name it does not know as it came', () => {
    expect(factLabel('eac3')).toBe('eac3');
  });
});
