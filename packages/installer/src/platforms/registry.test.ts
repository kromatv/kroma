import { describe, expect, it } from 'vitest';
import {
  detailPorts,
  findPlatform,
  platformArgs,
  platformCommands,
  platformFor,
  platformOptions,
  platforms,
  searchTargets,
  sweepPorts,
} from './registry';

describe('platforms', () => {
  it('answers for the four platforms this tool installs onto', () => {
    expect(platforms().map((module) => module.id)).toEqual([
      'tizen',
      'webos',
      'androidtv',
      'appletv',
    ]);
  });
});

describe('platformFor', () => {
  it('answers the module that installs onto that platform', () => {
    expect(platformFor('webos').package).toBe('.ipk');
  });

  it('refuses a platform no module answers for', () => {
    expect(() => platformFor('roku')).toThrow('no module answers for roku');
  });
});

describe('findPlatform', () => {
  it('answers nothing for a platform no module answers for', () => {
    expect(findPlatform('roku')).toBeUndefined();
  });
});

describe('sweepPorts', () => {
  it('gathers the port every module opens its sweep with', () => {
    expect(sweepPorts()).toEqual([8001, 9922, 1925, 5555]);
  });
});

describe('detailPorts', () => {
  it('gathers the ports a set is asked about only once it answered', () => {
    expect(detailPorts()).toEqual([26101, 3000, 1926]);
  });
});

describe('searchTargets', () => {
  it('lists the SSDP target the LG sets answer with their own name', () => {
    expect(searchTargets()).toEqual(['urn:lge-com:service:webos-second-screen:1']);
  });
});

describe('platformArgs', () => {
  it('merges the flags every module adds to the install command', () => {
    expect(Object.keys(platformArgs())).toEqual(['profile', 'native', 'passphrase']);
  });
});

describe('platformCommands', () => {
  it('merges the subcommands every module adds to the CLI', () => {
    expect(Object.keys(platformCommands())).toEqual(['probe', 'certificate']);
  });
});

describe('platformOptions', () => {
  it('keeps the flags a module declared, whatever else was typed', () => {
    const args = { profile: 'LUMA', native: true, target: 'all', _: ['install'] };

    expect(platformOptions(args)).toEqual({ profile: 'LUMA', native: true });
  });

  it('drops a flag whose value is neither text nor a switch', () => {
    expect(platformOptions({ passphrase: 12 })).toEqual({});
  });
});
