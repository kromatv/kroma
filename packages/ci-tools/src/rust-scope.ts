import { SERVER, type Workspace } from './rust-workspaces';

/** A slice of the server's tests: the ones that run WebAssembly components, or the rest. */
export type TestPart = 'core' | 'host';

const PARTS: readonly TestPart[] = ['core', 'host'];

const HOST_CRATES = [
  'kroma-module-supervisor',
  'kroma-wasm-host',
  'kroma-module-audit',
  'kroma-wasm-test-runner',
];

/** The packages cargo is pointed at in `ws`: every one, or one side of `part` in the server. */
export function scope(ws: Workspace, part?: TestPart): string[] {
  if (ws.id !== SERVER.id) {
    return [];
  }
  if (part === 'host') {
    return HOST_CRATES.flatMap((crate) => ['-p', crate]);
  }
  const excluded = part === 'core' ? HOST_CRATES.flatMap((crate) => ['--exclude', crate]) : [];
  return ['--workspace', ...excluded];
}

/** `--part` as given, or the whole server when it is absent. */
export function testPart(value: string | undefined): TestPart | undefined {
  if (value === undefined) {
    return undefined;
  }
  const part = PARTS.find((known) => known === value);
  if (part === undefined) {
    throw new Error(`--part is one of ${PARTS.join(', ')}, not '${value}'`);
  }
  return part;
}
