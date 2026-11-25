import { MagicString } from 'magic-string';
import type { NamedTarget } from './door-walk.ts';

const RUNTIME = '#ui/lib/component-names';

const HELPER = '__kromaName';

/** A module with its components' names appended. */
export interface AppendResult {
  readonly code: string;
  readonly map: ReturnType<MagicString['generateMap']>;
}

/** Appends one call per name after everything the module declares, so the
 *  code as written is left exactly as it was. */
export function appendNames(
  code: string,
  file: string,
  named: readonly NamedTarget[],
): AppendResult {
  const calls = named.map(({ target, name }) => `${HELPER}(${target}, ${JSON.stringify(name)});`);
  const s = new MagicString(code);
  s.append(`\nimport { nameComponent as ${HELPER} } from '${RUNTIME}';\n${calls.join('\n')}\n`);
  return {
    code: s.toString(),
    map: s.generateMap({ hires: true, source: file, includeContent: false }),
  };
}
