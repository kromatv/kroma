import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readTizenPackage } from './package-manifest';

const TIZEN_MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<manifest package="tv.kroma.app" version="0.1.40" api-version="6.0" xmlns="http://tizen.org/ns/packages">
  <profile name="tv" />
  <ui-application appid="tv.kroma.app" exec="ReactNativeTizen.dll" type="dotnet">
    <label>KROMA</label>
  </ui-application>
</manifest>
`;

const CONFIG_XML = `<?xml version="1.0" encoding="UTF-8"?>
<widget xmlns="http://www.w3.org/ns/widgets" xmlns:tizen="http://tizen.org/ns/widgets" id="http://kroma.app/tizen" version="0.1.33">
  <tizen:application id="KromaTV001.KROMA" package="KromaTV001" required_version="3.0"/>
</widget>
`;

let stage: string;

beforeEach(async () => {
  stage = await mkdtemp(join(tmpdir(), 'kroma-manifest-'));
});

afterEach(async () => {
  await rm(stage, { recursive: true, force: true });
});

describe('readTizenPackage', () => {
  it('reads a native package and its app from tizen-manifest.xml', async () => {
    await writeFile(join(stage, 'tizen-manifest.xml'), TIZEN_MANIFEST);

    expect(readTizenPackage(stage)).toEqual({
      type: 'tpk',
      packageId: 'tv.kroma.app',
      appId: 'tv.kroma.app',
    });
  });

  it('reads a web package and its app from config.xml', async () => {
    await writeFile(join(stage, 'config.xml'), CONFIG_XML);

    expect(readTizenPackage(stage)).toEqual({
      type: 'wgt',
      packageId: 'KromaTV001',
      appId: 'KromaTV001.KROMA',
    });
  });

  it('refuses a directory that carries neither manifest', () => {
    expect(() => readTizenPackage(stage)).toThrow(
      'the package has neither tizen-manifest.xml nor config.xml',
    );
  });

  it('refuses an id that could break out of the command the set runs', async () => {
    await writeFile(
      join(stage, 'tizen-manifest.xml'),
      TIZEN_MANIFEST.replace('package="tv.kroma.app"', 'package="tv.kroma.app;reboot"'),
    );

    expect(() => readTizenPackage(stage)).toThrow(
      'tizen-manifest.xml names no usable package on <manifest>',
    );
  });

  it('refuses a native manifest that declares no application', async () => {
    await writeFile(
      join(stage, 'tizen-manifest.xml'),
      TIZEN_MANIFEST.replace(/<ui-application[^>]*>/, '<ui-application>'),
    );

    expect(() => readTizenPackage(stage)).toThrow(
      'tizen-manifest.xml names no usable appid on <ui-application>',
    );
  });

  it('refuses a manifest too large to be one', async () => {
    await writeFile(join(stage, 'config.xml'), `${CONFIG_XML}${' '.repeat(300 * 1024)}`);

    expect(() => readTizenPackage(stage)).toThrow('is too large to be a manifest');
  });
});
