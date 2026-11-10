import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readSigningKey, type SigningKey } from './signing-key';
import { widgetResources } from './widget-resources';
import { type SignatureRole, widgetSignature } from './widget-signature';

const FILENAME: Record<SignatureRole, string> = {
  author: 'author-signature.xml',
  distributor: 'signature1.xml',
};

export interface WidgetSigningRequest {
  directory: string;
  author: SigningKey;
  distributor?: SigningKey;
}

/**
 * Signs a built widget directory in place, writing the same bytes
 * `tizen package -t wgt -s <profile>` writes, and returns the files written.
 * The author signs first because the distributor signature covers it; with no
 * distributor key the widget carries an author signature alone, which only an
 * emulator accepts.
 */
export async function signWidget(request: WidgetSigningRequest): Promise<string[]> {
  const written = [await sign(request.directory, 'author', request.author)];
  if (request.distributor) {
    written.push(await sign(request.directory, 'distributor', request.distributor));
  }
  return written;
}

async function sign(directory: string, role: SignatureRole, signingKey: SigningKey) {
  const { chain, key } = readSigningKey(signingKey);
  const xml = widgetSignature({
    directory,
    resources: widgetResources(directory, role),
    role,
    key,
    chain,
  });
  const path = join(directory, FILENAME[role]);
  await writeFile(path, xml);
  return path;
}
