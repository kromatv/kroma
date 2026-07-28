// Reading a built .spk's own metadata.
//
// The point of this module is that a catalog cannot disagree with the package it
// describes: both the static catalog and the per-release sidecar read the values
// out of the ARTEFACT rather than being told them. A disagreement here is not a
// build error - it is a NAS that offers version 0.1.35, downloads 0.1.34, and
// fails the checksum at install time, on a user's machine, after the release has
// shipped.
//
// So the tests build real ustar archives and read them back with the real `tar`,
// rather than mocking the extraction. Mocking it would leave exactly the thing
// that has to be true - that these bytes are the bytes DSM will get - untested.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { extractFromSpk, extractIcon, parseInfo, readSpkInfo } from './spk';

const work = mkdtempSync(join(tmpdir(), 'kroma-spk-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

let made = 0;

/** Build a real .spk (a ustar tar) holding the given members. */
function spk(members: Record<string, string | Buffer>): string {
  made += 1;
  const dir = join(work, `pkg-${made}`);
  execFileSync('mkdir', ['-p', dir]);
  for (const [name, body] of Object.entries(members)) writeFileSync(join(dir, name), body);
  const out = join(work, `kroma-${made}.spk`);
  execFileSync('tar', ['-cf', out, '-C', dir, ...Object.keys(members)]);
  return out;
}

const INFO = [
  'package="kroma"',
  'version="0.1.35-1"',
  'displayname="KROMA"',
  'description="Your media, your server."',
  'arch="x86_64"',
  'os_min_ver="7.0-40000"',
].join('\n');

describe('parseInfo', () => {
  it('reads quoted and unquoted values alike', () => {
    expect(parseInfo('package="kroma"\nversion=0.1.35')).toEqual({
      package: 'kroma',
      version: '0.1.35',
    });
  });

  it('keeps an `=` that belongs to the value', () => {
    // A description or a maintainer url routinely contains one; splitting on
    // every `=` truncates it silently.
    expect(parseInfo('description="a=b=c"').description).toBe('a=b=c');
  });

  it('keeps spaces and punctuation inside a quoted value', () => {
    expect(parseInfo(INFO).description).toBe('Your media, your server.');
  });

  it('strips only the OUTER quotes', () => {
    expect(parseInfo('desc="say \\"hi\\""').desc).toBe('say \\"hi\\"');
  });

  it('skips blank lines, comments and anything unparseable', () => {
    const info = ['', '# a comment', 'not a pair', 'version=1', '   '].join('\n');
    expect(parseInfo(info)).toEqual({ version: '1' });
  });

  it('lets a later line win, the way a shell-style file reads', () => {
    expect(parseInfo('version=1\nversion=2').version).toBe('2');
  });

  it('reads an empty value as empty rather than dropping the key', () => {
    // `description=` is how a package with no description is written; losing the
    // key entirely would fall through to the default instead.
    expect(parseInfo('description=')).toEqual({ description: '' });
  });

  it('is empty for an empty file', () => {
    expect(parseInfo('')).toEqual({});
  });
});

describe('extractFromSpk', () => {
  it('reads a member straight out of the archive', () => {
    const path = spk({ INFO, 'PACKAGE_ICON.PNG': 'icon-bytes' });
    expect(extractFromSpk(path, 'INFO').toString('utf8')).toContain('version="0.1.35-1"');
  });

  it('returns the member’s exact bytes, not text', () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);
    const path = spk({ INFO, 'PACKAGE_ICON.PNG': bytes });
    // The icon is copied into the catalog as base64; a text round trip would
    // mangle every byte above 0x7f.
    expect([...extractFromSpk(path, 'PACKAGE_ICON.PNG')]).toEqual([...bytes]);
  });

  it('throws for a member that is not there', () => {
    const path = spk({ INFO });
    expect(() => extractFromSpk(path, 'NOPE')).toThrow();
  });
});

describe('extractIcon', () => {
  it('prefers the 256px icon', () => {
    const path = spk({
      INFO,
      'PACKAGE_ICON.PNG': 'small',
      'PACKAGE_ICON_256.PNG': 'large',
    });
    // DSM's package centre renders at 256; the 72px one looks soft there.
    expect(extractIcon(path).toString('utf8')).toBe('large');
  });

  it('falls back to the plain icon when there is no 256', () => {
    const path = spk({ INFO, 'PACKAGE_ICON.PNG': 'small' });
    expect(extractIcon(path).toString('utf8')).toBe('small');
  });

  it('throws when the package has no icon at all', () => {
    const path = spk({ INFO });
    // Better a failed build than a catalog entry with a broken image.
    expect(() => extractIcon(path)).toThrow();
  });
});

describe('readSpkInfo', () => {
  it('reports what the package says about itself', () => {
    const path = spk({ INFO });
    expect(readSpkInfo(path)).toMatchObject({
      package: 'kroma',
      version: '0.1.35-1',
      dname: 'KROMA',
      desc: 'Your media, your server.',
      arch: 'x86_64',
      firmware: '7.0-40000',
    });
  });

  it('reports the size and md5 of the FILE DSM will download', () => {
    const path = spk({ INFO });
    const bytes = execFileSync('cat', [path]);
    const info = readSpkInfo(path);
    // These two are what the NAS verifies after downloading. Computed over
    // anything but the artefact itself, they fail at install time on a user's
    // machine, after the release has shipped.
    expect(info.size).toBe(bytes.byteLength);
    expect(info.md5).toBe(createHash('md5').update(bytes).digest('hex'));
  });

  it('refuses a package with no version', () => {
    const path = spk({ INFO: 'package="kroma"' });
    // A catalog entry with an empty version is one DSM can never upgrade past.
    expect(() => readSpkInfo(path)).toThrow(/version/i);
  });

  it('names the offending file when it refuses', () => {
    const path = spk({ INFO: 'package="kroma"' });
    // The generator walks a directory of them; "no version" alone says nothing.
    expect(() => readSpkInfo(path)).toThrow(new RegExp(path.replaceAll('/', '\\/')));
  });

  it('fills in the defaults for everything else', () => {
    const path = spk({ INFO: 'version="0.1.35-1"' });
    expect(readSpkInfo(path)).toMatchObject({
      package: 'kroma',
      dname: 'KROMA',
      desc: '',
      arch: 'x86_64',
      firmware: '7.0-40000',
    });
  });

  it('does not let an empty value defeat a default', () => {
    // `arch=` is written by some build paths; an empty arch in a catalog makes
    // the package invisible to every NAS.
    const path = spk({ INFO: 'version="0.1.35-1"\narch=\ndisplayname=' });
    const info = readSpkInfo(path);
    expect(info.arch).toBe('x86_64');
    expect(info.dname).toBe('KROMA');
  });
});
