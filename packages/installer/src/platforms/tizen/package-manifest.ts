import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const NATIVE_MANIFEST = 'tizen-manifest.xml';
const WEB_MANIFEST = 'config.xml';
const MAX_MANIFEST_BYTES = 256 * 1024;

const Identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);

/** What a Samsung package is and what it installs, as its own manifest says. */
export interface TizenPackage {
  type: 'tpk' | 'wgt';
  packageId: string;
  appId: string;
}

/**
 * Reads an unpacked package: a native `.tpk` carries `tizen-manifest.xml`, a
 * web `.wgt` carries `config.xml`. The ids reach the set's shell, so anything
 * but a plain identifier is refused.
 */
export function readTizenPackage(directory: string): TizenPackage {
  const native = join(directory, NATIVE_MANIFEST);
  if (existsSync(native)) {
    const xml = readManifest(native);
    return {
      type: 'tpk',
      packageId: identifier(xml, 'manifest', 'package', NATIVE_MANIFEST),
      appId: identifier(xml, 'ui-application', 'appid', NATIVE_MANIFEST),
    };
  }
  const web = join(directory, WEB_MANIFEST);
  if (!existsSync(web))
    throw new Error(`the package has neither ${NATIVE_MANIFEST} nor ${WEB_MANIFEST}`);
  const xml = readManifest(web);
  return {
    type: 'wgt',
    packageId: identifier(xml, 'tizen:application', 'package', WEB_MANIFEST),
    appId: identifier(xml, 'tizen:application', 'id', WEB_MANIFEST),
  };
}

function readManifest(path: string): string {
  if (statSync(path).size > MAX_MANIFEST_BYTES)
    throw new Error(`${path} is too large to be a manifest`);
  return readFileSync(path, 'utf8');
}

function identifier(xml: string, element: string, name: string, file: string): string {
  const tag = new RegExp(`<${element}\\s[^>]*>`).exec(xml)?.[0];
  const value = tag === undefined ? undefined : new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
  const parsed = Identifier.safeParse(value);
  if (!parsed.success) throw new Error(`${file} names no usable ${name} on <${element}>`);
  return parsed.data;
}
