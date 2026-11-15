export const PYTHON_CANDIDATES = [
  'python3',
  'python3.13',
  'python3.12',
  'python3.11',
  'python3.14',
] as const;

const MINIMUM = { major: 3, minor: 11 };

export interface PythonProbe {
  command: string;
  version: string | undefined;
}

export function isSupportedPython(version: string): boolean {
  const read = /^(\d+)\.(\d+)/.exec(version);
  if (read === null) {
    return false;
  }
  const major = Number(read[1]);
  const minor = Number(read[2]);
  return major > MINIMUM.major || (major === MINIMUM.major && minor >= MINIMUM.minor);
}

const describe = (probe: PythonProbe) =>
  probe.version === undefined
    ? `${probe.command}: not found`
    : `${probe.command}: ${probe.version}`;

/** The first probed interpreter the tools can run on. Throws, naming what was found, when there is none. */
export function pickPython(probes: readonly PythonProbe[]): string {
  const usable = probes.find(
    (probe) => probe.version !== undefined && isSupportedPython(probe.version),
  );
  if (usable === undefined) {
    throw new Error(
      [
        `The quality tools need Python ${MINIMUM.major}.${MINIMUM.minor} or newer and none is on PATH.`,
        ...probes.map((probe) => `  ${describe(probe)}`),
        'Install one (for example `brew install python@3.13`) and run `bun run quality:setup` again.',
      ].join('\n'),
    );
  }
  return usable.command;
}
