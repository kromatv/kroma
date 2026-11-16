import { prefixOf } from '../../discovery/lan';

const OPEN_DEVELOPER_MODE = 'on the TV open Apps and type 1 2 3 4 5';
const RESTART = 'unplug the TV for 30 seconds';

export interface SamsungDeveloperMode {
  declared: boolean;
  sdb: boolean;
  trusts: string | undefined;
}

export interface Readiness {
  note: string;
  nextStep?: string;
}

/**
 * What a Samsung set lets this computer do, from what its API says about
 * developer mode, whether sdb answers, and the addresses this computer holds.
 * A set that cannot take an app yet carries the one thing to do on it.
 */
export function samsungReadiness(
  { declared, sdb, trusts }: SamsungDeveloperMode,
  host: string,
  own: readonly string[],
): Readiness {
  const me = own.find((address) => prefixOf(address) === prefixOf(host));
  if (!declared && !sdb) {
    return { note: developerModeOff(me) };
  }
  if (namesAnother(trusts, me, own)) {
    return {
      note: `Developer mode names ${trusts} as the host PC, not this computer (${me}): ${OPEN_DEVELOPER_MODE}, enter ${me}, then ${RESTART}`,
      nextStep: `host PC is ${trusts}, not ${me}`,
    };
  }
  if (sdb) {
    const named = trusts ? `host PC ${trusts}` : 'no host PC set';
    return { note: `sdb open, ${named}` };
  }
  return trusts ? restartNeeded(trusts) : noHostPc(me);
}

function namesAnother(trusts: string | undefined, me: string | undefined, own: readonly string[]) {
  return Boolean(trusts && me && !own.includes(trusts));
}

function developerModeOff(me: string | undefined): string {
  return `Developer mode off: ${OPEN_DEVELOPER_MODE}, switch it on, enter ${me ?? 'this computer'} as the host PC IP, then ${RESTART}`;
}

function noHostPc(me: string | undefined): Readiness {
  return {
    note: `Developer mode on with no host PC: ${OPEN_DEVELOPER_MODE}, enter ${me ?? 'this computer'} as the host PC IP, then ${RESTART}`,
    nextStep: 'no host PC set',
  };
}

function restartNeeded(trusts: string): Readiness {
  return {
    note: `Developer mode on, host PC ${trusts}, but sdb stays closed until the TV restarts: ${RESTART}`,
    nextStep: `restart it: ${RESTART}`,
  };
}
