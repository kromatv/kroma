import { createHash, createSign, type KeyObject, type X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { WidgetResource } from './widget-resources';

const DSIG = 'http://www.w3.org/2000/09/xmldsig#';
const EXCLUSIVE_C14N = 'http://www.w3.org/2001/10/xml-exc-c14n#';
const RSA_SHA512 = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha512';
const SHA512 = 'http://www.w3.org/2001/04/xmlenc#sha512';
const C14N11 = 'http://www.w3.org/2006/12/xml-c14n11';
const PROPERTIES = 'http://www.w3.org/2009/xmldsig-properties';
const DIGSIG = 'http://www.w3.org/ns/widgets-digsig';
const BASE64_COLUMNS = 76;
const CHAIN_LIMIT = 3;

export type SignatureRole = 'author' | 'distributor';

export interface WidgetSignatureRequest {
  directory: string;
  resources: readonly WidgetResource[];
  role: SignatureRole;
  key: KeyObject;
  chain: readonly X509Certificate[];
}

/**
 * One widget signature document, emitted already canonical: the bytes are what
 * exclusive c14n would produce, so `SignedInfo` is signed as written rather than
 * re-serialised. Identical to `tizen package -t wgt` down to the byte.
 */
export function widgetSignature(request: WidgetSignatureRequest): string {
  const { chain, directory, key, resources, role } = request;
  const id = role === 'author' ? 'AuthorSignature' : 'DistributorSignature';
  const properties = signatureProperties(id, role);

  const references = [
    ...resources.map((resource) =>
      fileReference(resource.uri, digest(readFileSync(join(directory, resource.path)))),
    ),
    propertyReference(digest(Buffer.from(objectElement(properties, ` xmlns="${DSIG}"`), 'utf8'))),
  ];
  const signedInfo = (open: string) =>
    [
      open,
      `<CanonicalizationMethod Algorithm="${EXCLUSIVE_C14N}"></CanonicalizationMethod>`,
      `<SignatureMethod Algorithm="${RSA_SHA512}"></SignatureMethod>`,
      ...references,
      '</SignedInfo>',
    ].join('\n');
  const signature = createSign('RSA-SHA512')
    .update(signedInfo(`<SignedInfo xmlns="${DSIG}">`), 'utf8')
    .sign(key);

  return [
    `<Signature xmlns="${DSIG}" Id="${id}">`,
    signedInfo('<SignedInfo>'),
    `<SignatureValue>\n${wrap(signature)}\n</SignatureValue>`,
    '<KeyInfo>',
    '<X509Data>',
    ...chain
      .slice(0, CHAIN_LIMIT)
      .map((certificate) => `<X509Certificate>\n${wrap(certificate.raw)}\n</X509Certificate>`),
    '</X509Data>',
    '</KeyInfo>',
    objectElement(properties, ''),
    '</Signature>',
  ].join('\n');
}

const objectElement = (properties: string, namespace: string) =>
  `<Object${namespace} Id="prop">${properties}</Object>`;

const signatureProperties = (target: string, role: SignatureRole) =>
  [
    `<SignatureProperties xmlns:dsp="${PROPERTIES}">`,
    property('profile', target, `<dsp:Profile URI="${DIGSIG}#profile"></dsp:Profile>`),
    property('role', target, `<dsp:Role URI="${DIGSIG}#role-${role}"></dsp:Role>`),
    property('identifier', target, '<dsp:Identifier></dsp:Identifier>'),
    '</SignatureProperties>',
  ].join('');

const property = (name: string, target: string, value: string) =>
  `<SignatureProperty Id="${name}" Target="#${target}">${value}</SignatureProperty>`;

const fileReference = (uri: string, value: string) =>
  [
    `<Reference URI="${uri}">`,
    `<DigestMethod Algorithm="${SHA512}"></DigestMethod>`,
    `<DigestValue>${value}</DigestValue>`,
    '</Reference>',
  ].join('\n');

const propertyReference = (value: string) =>
  [
    '<Reference URI="#prop">',
    '<Transforms>',
    `<Transform Algorithm="${C14N11}"></Transform>`,
    '</Transforms>',
    `<DigestMethod Algorithm="${SHA512}"></DigestMethod>`,
    `<DigestValue>${value}</DigestValue>`,
    '</Reference>',
  ].join('\n');

const digest = (bytes: Buffer) => wrap(createHash('sha512').update(bytes).digest());

const BASE64_LINE = new RegExp(`.{${BASE64_COLUMNS}}`, 'g');

const wrap = (bytes: Buffer) => bytes.toString('base64').replace(BASE64_LINE, '$&\n').trimEnd();
