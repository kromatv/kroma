import { describe, expect, it } from 'vitest';
import {
  detailPorts,
  findModule,
  moduleArgs,
  moduleCommands,
  moduleFor,
  moduleOptions,
  modules,
  searchTargets,
  sweepPorts,
} from './registry';

describe('modules', () => {
  it('answers for the four platforms this tool installs onto', () => {
    expect(modules().map((module) => module.id)).toEqual([
      'tizen',
      'webos',
      'androidtv',
      'appletv',
    ]);
  });
});

describe('moduleFor', () => {
  it('answers the module that installs onto that platform', () => {
    expect(moduleFor('webos').package).toBe('.ipk');
  });

  it('refuses a platform no module answers for', () => {
    expect(() => moduleFor('roku')).toThrow('no module answers for roku');
  });
});

describe('findModule', () => {
  it('answers nothing for a platform no module answers for', () => {
    expect(findModule('roku')).toBeUndefined();
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

describe('moduleArgs', () => {
  it('merges the flags every module adds to the install command', () => {
    expect(Object.keys(moduleArgs())).toEqual(['profile', 'native', 'passphrase']);
  });
});

describe('moduleCommands', () => {
  it('merges the subcommands every module adds to the CLI', () => {
    expect(Object.keys(moduleCommands())).toEqual(['probe', 'certificate']);
  });
});

describe('moduleOptions', () => {
  it('keeps the flags a module declared, whatever else was typed', () => {
    const args = { profile: 'LUMA', native: true, target: 'all', _: ['install'] };

    expect(moduleOptions(args)).toEqual({ profile: 'LUMA', native: true });
  });

  it('drops a flag whose value is neither text nor a switch', () => {
    expect(moduleOptions({ passphrase: 12 })).toEqual({});
  });
});
