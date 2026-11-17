import { describe, expect, it } from 'vitest';
import { belowPackageFloor, installFailure, OtherAuthor } from './install-failure';
import type { TizenPackage } from './package-manifest';

const widget: TizenPackage = {
  type: 'wgt',
  packageId: 'KromaTV001',
  appId: 'KromaTV001.KROMA',
  requiredVersion: '6.0',
};

describe('installFailure', () => {
  it('quotes the last two lines the tools said when the failure names no certificate', () => {
    const output = ['Transferring the package...', 'error: the package is damaged'].join('\n');

    expect(installFailure(output, 'kroma', null).message).toBe(
      'the install failed: Transferring the package... / error: the package is damaged',
    );
  });

  it('quotes the line a Samsung set names its failure on, not the timing after it', () => {
    const output = [
      'app_id[KromaTV001] installing[28]',
      'app_id[KromaTV001] install failed[118]',
      'spend time for wascmd is [1688]ms',
      'cmd_ret:0',
      '',
    ].join('\r\n');

    expect(installFailure(output, 'samsung', null).message).toBe(
      'the install failed: app_id[KromaTV001] install failed[118]',
    );
  });

  it('says only that it failed when the tools said nothing at all', () => {
    expect(installFailure('', 'kroma', null).message).toBe('the install failed');
  });

  it('says to remove an app another author installed, and asks Samsung for nothing', () => {
    const output = 'install failed[118, -11], reason: Author certificate not match :';

    const { message } = installFailure(output, 'samsung', '1900A2C4D6E8');

    expect(message).toContain('another author signed the KROMA already on this set');
    expect(message).toContain('Delete KROMA on the TV');
    expect(message).not.toContain('DUID');
  });

  it('tells a refusal over the author apart from every other one', () => {
    const output = 'install failed[118, -11], reason: Author certificate not match :';

    expect(installFailure(output, 'samsung', null)).toBeInstanceOf(OtherAuthor);
    expect(installFailure('error: certificate is invalid', 'kroma', null)).not.toBeInstanceOf(
      OtherAuthor,
    );
  });

  it('names the profile whose chain a retail set refused', () => {
    const { message } = installFailure('error: certificate is invalid', 'kroma', null);

    expect(message).toContain('profile kroma signed it and the set refused that chain.');
    expect(message).toContain('certificates Samsung issued for its own DUID');
    expect(message).toContain('the certificate command of this tool gets them');
  });

  it('gives the DUID of the set when the set said which one it is', () => {
    const { message } = installFailure('error: certificate is invalid', null, '1900A2C4D6E8');

    expect(message).toContain('The DUID of this set is 1900A2C4D6E8.');
  });
});

describe('belowPackageFloor', () => {
  it('says a set older than the package asks for would refuse it, and points at canary', () => {
    const refusal = belowPackageFloor('5.5', widget, 'stable');

    expect(refusal?.message).toBe(
      'this set runs Tizen 5.5, and this KROMA needs Tizen 6.0 or later, so the set would refuse it. The canary build reaches older sets: choose Canary when the installer asks which version, or pass --source canary.',
    );
  });

  it('points nowhere else when the package already came from canary', () => {
    const refusal = belowPackageFloor('2.4', { ...widget, requiredVersion: '3.0' }, 'canary');

    expect(refusal?.message).toBe(
      'this set runs Tizen 2.4, and this KROMA needs Tizen 3.0 or later, so the set would refuse it.',
    );
  });

  it('lets a set at or above the floor through', () => {
    expect(belowPackageFloor('6.0', widget, 'stable')).toBeNull();
    expect(belowPackageFloor('9.0', widget, 'stable')).toBeNull();
  });

  it('lets the install go on when either version is unknown', () => {
    expect(belowPackageFloor(undefined, widget)).toBeNull();
    expect(belowPackageFloor('5.5', { ...widget, requiredVersion: undefined })).toBeNull();
  });
});
