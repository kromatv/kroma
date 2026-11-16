import { describe, expect, it } from 'vitest';
import { samsungReadiness } from './readiness';

const TV = '192.168.1.247';
const PC = ['172.24.80.1', '192.168.1.85'];

describe('samsungReadiness', () => {
  it('calls a set ready once sdb answers and it names this computer', () => {
    expect(samsungReadiness({ declared: true, sdb: true, trusts: '192.168.1.85' }, TV, PC)).toEqual(
      {
        note: 'sdb open, host PC 192.168.1.85',
      },
    );
  });

  it('says to restart a set whose developer mode names this computer but whose sdb is closed', () => {
    const readiness = samsungReadiness(
      { declared: true, sdb: false, trusts: '192.168.1.85' },
      TV,
      PC,
    );

    expect(readiness.nextStep).toBe('restart it: unplug the TV for 30 seconds');
    expect(readiness.note).toBe(
      'Developer mode on, host PC 192.168.1.85, but sdb stays closed until the TV restarts: unplug the TV for 30 seconds',
    );
  });

  it('names both addresses when developer mode names another computer', () => {
    const readiness = samsungReadiness(
      { declared: true, sdb: false, trusts: '192.168.1.20' },
      TV,
      PC,
    );

    expect(readiness.nextStep).toBe('host PC is 192.168.1.20, not 192.168.1.85');
    expect(readiness.note).toBe(
      'Developer mode names 192.168.1.20 as the host PC, not this computer (192.168.1.85): on the TV open Apps and type 1 2 3 4 5, enter 192.168.1.85, then unplug the TV for 30 seconds',
    );
  });

  it('flags another computer even when sdb is open, since the set will refuse this one', () => {
    const readiness = samsungReadiness(
      { declared: true, sdb: true, trusts: '192.168.1.20' },
      TV,
      PC,
    );

    expect(readiness.nextStep).toBe('host PC is 192.168.1.20, not 192.168.1.85');
  });

  it('takes any address of this computer on the network as the host PC', () => {
    const twoCards = ['192.168.1.85', '192.168.1.86'];

    expect(
      samsungReadiness({ declared: true, sdb: true, trusts: '192.168.1.86' }, TV, twoCards)
        .nextStep,
    ).toBeUndefined();
  });

  it('makes no claim about the host PC from a computer that is off the network of the set', () => {
    const behindNat = ['172.24.80.17'];

    expect(
      samsungReadiness({ declared: true, sdb: true, trusts: '192.168.1.85' }, TV, behindNat),
    ).toEqual({ note: 'sdb open, host PC 192.168.1.85' });
  });

  it('asks for a host PC when developer mode is on without one', () => {
    const readiness = samsungReadiness({ declared: true, sdb: false, trusts: undefined }, TV, PC);

    expect(readiness.nextStep).toBe('no host PC set');
    expect(readiness.note).toContain('enter 192.168.1.85 as the host PC IP');
  });

  it('says how to turn developer mode on, with the address to enter', () => {
    const readiness = samsungReadiness({ declared: false, sdb: false, trusts: undefined }, TV, PC);

    expect(readiness.nextStep).toBeUndefined();
    expect(readiness.note).toBe(
      'Developer mode off: on the TV open Apps and type 1 2 3 4 5, switch it on, enter 192.168.1.85 as the host PC IP, then unplug the TV for 30 seconds',
    );
  });

  it('says this computer when it holds no address on the set network', () => {
    expect(
      samsungReadiness({ declared: false, sdb: false, trusts: undefined }, TV, []).note,
    ).toContain('enter this computer as the host PC IP');
  });
});
