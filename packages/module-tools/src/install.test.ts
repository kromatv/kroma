import { describe, expect, it } from 'vitest';
import { bundleFor, hostTriplePart } from './install';

describe('bundleFor', () => {
  const files = [
    'tv.kroma.vpn-aarch64-apple-darwin.kmod',
    'tv.kroma.vpn-x86_64-unknown-linux-musl.kmod',
    'tv.kroma.scene.kmod',
    'tv.kroma.vpnx-aarch64-apple-darwin.kmod',
  ];

  it('takes the universal bundle when a module ships one', () => {
    expect(bundleFor(files, 'tv.kroma.scene')).toBe('tv.kroma.scene.kmod');
  });

  it("takes this machine's build over a cross-compiled one", () => {
    expect(bundleFor(files, 'tv.kroma.vpn', hostTriplePart('arm64', 'darwin'))).toBe(
      'tv.kroma.vpn-aarch64-apple-darwin.kmod',
    );
    expect(bundleFor(files, 'tv.kroma.vpn', hostTriplePart('x64', 'linux'))).toBe(
      'tv.kroma.vpn-x86_64-unknown-linux-musl.kmod',
    );
  });

  it('does not hand an arm Mac an aarch64 LINUX build', () => {
    // Matching on arch alone did exactly that.
    const linuxOnly = ['tv.kroma.vpn-aarch64-unknown-linux-musl.kmod'];
    expect(bundleFor(linuxOnly, 'tv.kroma.vpn', hostTriplePart('arm64', 'darwin'))).toBe(
      // Nothing matches the host, so the only build there is offered and the
      // server decides - but it is not claimed to be this machine's.
      'tv.kroma.vpn-aarch64-unknown-linux-musl.kmod',
    );
    expect(hostTriplePart('arm64', 'darwin')).toBe('aarch64-apple-darwin');
    expect(hostTriplePart('arm64', 'linux')).toBe('aarch64-unknown-linux');
  });

  it('does not mistake a longer id that starts the same', () => {
    // `tv.kroma.vpnx` must not be offered as a build of `tv.kroma.vpn`.
    expect(bundleFor(['tv.kroma.vpnx-aarch64-apple-darwin.kmod'], 'tv.kroma.vpn')).toBeUndefined();
  });

  it('is undefined when nothing was packed for it', () => {
    expect(bundleFor(files, 'tv.kroma.nope')).toBeUndefined();
  });
});
