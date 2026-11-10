import { describe, expect, it } from 'vitest';
import { installFailure } from './install-failure';

describe('installFailure', () => {
  it('quotes what the tools said when the failure names no certificate', () => {
    const output = ['Transferring the package...', 'error: install failed[118]'].join('\n');

    expect(installFailure(output, 'kroma', null)).toBe(
      'the install failed: Transferring the package... / error: install failed[118]',
    );
  });

  it('says only that it failed when the tools said nothing at all', () => {
    expect(installFailure('', 'kroma', null)).toBe('the install failed');
  });

  it('names the profile whose chain a retail set refused', () => {
    const message = installFailure('error: certificate is invalid', 'kroma', null);

    expect(message).toContain('profile kroma signed it and the set refused that chain.');
    expect(message).toContain('certificates Samsung issued for its own DUID');
    expect(message).toContain('the certificate command of this tool gets them');
  });

  it('gives the DUID of the set when the set said which one it is', () => {
    const message = installFailure('error: certificate is invalid', null, '1900A2C4D6E8');

    expect(message).toContain('The DUID of this set is 1900A2C4D6E8.');
  });
});
