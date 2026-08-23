import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { SignatureRole } from './widget-signature';

const BUILD_LEFTOVERS = new Set(['.manifest.tmp', '.delta.lst']);
const AUTHOR_SIGNATURE = 'author-signature.xml';
const DISTRIBUTOR_SIGNATURE = /^signature[1-9]\d*\.xml$/;
const UNSAFE = '% <>#{}|\\^~[]`;/?@=&$!*:+';
const ATTRIBUTE: Record<string, string> = {
  '"': '&quot;',
  '\t': '&#x9;',
  '\n': '&#xA;',
  '\r': '&#xD;',
};

export interface WidgetResource {
  path: string;
  uri: string;
}

/**
 * Every file a widget signature covers, in the order Tizen lists them: relative
 * paths sorted by UTF-16 code unit, then percent-escaped. Signature files and
 * packaging leftovers are left out wherever in the tree they sit, and an author
 * signature also leaves out itself.
 */
export function widgetResources(directory: string, role: SignatureRole): WidgetResource[] {
  return walk(directory, '')
    .filter((path) => !excluded(path.split('/').at(-1) ?? path, role))
    .sort((left, right) => (left < right ? -1 : 1))
    .map((path) => ({ path, uri: escapeUri(path) }));
}

// A symlink is never followed: a widget carries none, and a tree that has one
// pointing at an ancestor makes this walk run until the machine gives up.
function walk(directory: string, prefix: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) found.push(...walk(join(directory, entry.name), relative));
    else if (entry.isFile()) found.push(relative);
  }
  return found;
}

function excluded(name: string, role: SignatureRole): boolean {
  if (BUILD_LEFTOVERS.has(name) || DISTRIBUTOR_SIGNATURE.test(name)) return true;
  return role === 'author' && name === AUTHOR_SIGNATURE;
}

function escapeUri(path: string): string {
  let escaped = '';
  for (const character of path) {
    const code = character.codePointAt(0) ?? 0;
    if (code > 127) escaped += percent(Buffer.from(character, 'utf8'));
    else if (UNSAFE.includes(character)) escaped += percent(Buffer.from(character, 'ascii'));
    else escaped += ATTRIBUTE[character] ?? character;
  }
  return escaped;
}

const percent = (bytes: Buffer) =>
  [...bytes].map((byte) => `%${byte.toString(16).toUpperCase().padStart(2, '0')}`).join('');
