import { createVerify, X509Certificate } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { writeArchive } from './pkcs12.fixture';
import { signWidget } from './widget';
import {
  AUTHOR_SIGNATURE,
  DISTRIBUTOR_SIGNATURE,
  WIDGET_FILES,
  writeWidget,
} from './widget.fixture';

const DSIG = 'http://www.w3.org/2000/09/xmldsig#';

const between = (xml: string, tag: string) =>
  xml.slice(xml.indexOf(`<${tag}>`) + tag.length + 2, xml.indexOf(`</${tag}>`));

const withoutSignerBytes = (xml: string) =>
  xml
    .replace(
      /<SignatureValue>[\s\S]*?<\/SignatureValue>/,
      '<SignatureValue>SIGNER</SignatureValue>',
    )
    .replace(/<X509Data>[\s\S]*?<\/X509Data>/, '<X509Data>SIGNER</X509Data>')
    .replace(
      /(<Reference URI="author-signature\.xml">[\s\S]*?<DigestValue>)[\s\S]*?(<\/DigestValue>)/,
      '$1SIGNER$2',
    );

function signedInfoVerifies(xml: string): boolean {
  const end = xml.indexOf('</SignedInfo>') + '</SignedInfo>'.length;
  const signedInfo = xml
    .slice(xml.indexOf('<SignedInfo>'), end)
    .replace('<SignedInfo>', `<SignedInfo xmlns="${DSIG}">`);
  const certificate = new X509Certificate(Buffer.from(between(xml, 'X509Certificate'), 'base64'));
  return createVerify('RSA-SHA512')
    .update(signedInfo, 'utf8')
    .verify(certificate.publicKey, Buffer.from(between(xml, 'SignatureValue'), 'base64'));
}

const temporary: string[] = [];
const keys = mkdtempSync(join(tmpdir(), 'kroma-widget-keys-'));
const author = writeArchive(keys, 'author');
let directory = '';
let written: string[] = [];

beforeAll(async () => {
  directory = writeWidget(WIDGET_FILES);
  temporary.push(keys, directory);

  written = await signWidget({
    directory,
    author,
    distributor: writeArchive(keys, 'distributor'),
  });
});

afterAll(() => {
  for (const path of temporary) rmSync(path, { recursive: true, force: true });
});

describe('signWidget', () => {
  it('writes the author signature first, because the distributor covers it', () => {
    expect(written).toEqual([
      join(directory, 'author-signature.xml'),
      join(directory, 'signature1.xml'),
    ]);
  });

  it('writes the author signature tizen package writes, byte for byte', () => {
    const xml = readFileSync(join(directory, 'author-signature.xml'), 'utf8');

    expect(withoutSignerBytes(xml)).toBe(AUTHOR_SIGNATURE);
  });

  it('writes the distributor signature tizen package writes, byte for byte', () => {
    const xml = readFileSync(join(directory, 'signature1.xml'), 'utf8');

    expect(withoutSignerBytes(xml)).toBe(DISTRIBUTOR_SIGNATURE);
  });

  it('signs the SignedInfo a reader canonicalises, not the bytes on disk', () => {
    for (const path of written) {
      expect(signedInfoVerifies(readFileSync(path, 'utf8'))).toBe(true);
    }
  });

  it('signs with the author alone when Samsung issued no distributor certificate', async () => {
    const alone = writeWidget(WIDGET_FILES);
    temporary.push(alone);

    const files = await signWidget({ directory: alone, author });

    expect(files).toEqual([join(alone, 'author-signature.xml')]);
  });
});
