import { describe, expect, it } from 'vitest';
import {
  installCommands,
  launchCommands,
  PACKAGE_TEMP_DIR,
  packageIdOf,
  remoteName,
  remotePath,
  removeCommands,
  uninstallCommands,
} from './commands';

describe('the remote path', () => {
  it('lands the package in the directory the set advertises', () => {
    expect(remotePath(PACKAGE_TEMP_DIR, 'KROMA-tizen-1.2.3.wgt')).toBe(
      '/home/owner/share/tmp/sdk_tools/KROMA-tizen-1.2.3.wgt',
    );
  });

  it('does not double the separator on a directory that ends in one', () => {
    expect(remotePath('/tmp/', 'KROMA.wgt')).toBe('/tmp/KROMA.wgt');
  });

  it('flattens anything a shell would read as syntax', () => {
    expect(remoteName('K R;rm -rf /.wgt')).toBe('K_R_rm_-rf__.wgt');
  });

  it('names the package itself when the file name leaves nothing usable', () => {
    expect(remoteName('...')).toBe('package.wgt');
  });

  it('refuses a directory that is not an absolute plain path', () => {
    expect(() => remotePath('/tmp/$(id)', 'KROMA.wgt')).toThrow(/unquotable/);
  });
});

describe('the install commands', () => {
  it('asks the television first, then generic sdbd, then pkgcmd', () => {
    const commands = installCommands('KromaTV001', '/tmp/KROMA.wgt');

    expect(commands).toEqual([
      '0 vd_appinstall KromaTV001 /tmp/KROMA.wgt',
      '0 appinstall wgt /tmp/KROMA.wgt',
      '/usr/bin/pkgcmd -i -t wgt -p "/tmp/KROMA.wgt" -q',
    ]);
  });

  it('carries the package type through to both generic shapes', () => {
    const commands = installCommands('KromaTV001', '/tmp/KROMA.tpk', 'tpk');

    expect(commands[1]).toBe('0 appinstall tpk /tmp/KROMA.tpk');
    expect(commands[2]).toBe('/usr/bin/pkgcmd -i -t tpk -p "/tmp/KROMA.tpk" -q');
  });
});

describe('the other commands', () => {
  it('uninstalls by package id', () => {
    expect(uninstallCommands('KromaTV001')).toEqual([
      '0 vd_appuninstall KromaTV001',
      '0 appuninstall KromaTV001',
      '/usr/bin/pkgcmd -u -n KromaTV001 -q',
    ]);
  });

  it('launches by application id', () => {
    expect(launchCommands('KromaTV001.KROMA')).toEqual([
      '0 was_execute KromaTV001.KROMA',
      '0 execute KromaTV001.KROMA',
      '/usr/bin/app_launcher -s KromaTV001.KROMA',
    ]);
  });

  it('quotes the path it deletes, as sdb does', () => {
    expect(removeCommands('/tmp/KROMA.wgt')).toEqual([
      '0 rmfile "/tmp/KROMA.wgt"',
      '/bin/rm -f "/tmp/KROMA.wgt"',
    ]);
  });
});

describe('the package id', () => {
  it('is the first segment of an application id', () => {
    expect(packageIdOf('KromaTV001.KROMA')).toBe('KromaTV001');
  });

  it('is the whole id when there is nothing to split', () => {
    expect(packageIdOf('KromaTV001')).toBe('KromaTV001');
  });
});
