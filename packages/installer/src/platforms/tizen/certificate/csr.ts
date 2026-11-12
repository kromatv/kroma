import { createSign, type KeyObject } from 'node:crypto';
import * as der from './asn1';
import { OID } from './x509';

const GENERAL_NAME_URI = 0x86;
const PRINTABLE = /^[A-Za-z0-9 '()+,./:=?-]*$/;

type Attribute = readonly [id: string, value: Buffer];

const name = (...attributes: Attribute[]) =>
  der.sequence(...attributes.map(([id, value]) => der.set(der.sequence(der.oid(id), value))));

/**
 * The subject Samsung's Certificate Manager writes for an author: the name,
 * after five fields it sends empty.
 */
export function authorSubject(commonName: string): Buffer {
  const empty = der.printable('');
  const named = PRINTABLE.test(commonName) ? der.printable(commonName) : der.utf8(commonName);
  return name(
    [OID.country, empty],
    [OID.state, empty],
    [OID.locality, empty],
    [OID.organization, empty],
    [OID.organizationalUnit, empty],
    [OID.commonName, named],
  );
}

/**
 * The subject Samsung's Certificate Manager writes for a distributor: always
 * `TizenSDK`, with the address of the Samsung account that asks.
 */
export function distributorSubject(email: string): Buffer {
  const empty = der.utf8('');
  return name(
    [OID.commonName, der.utf8('TizenSDK')],
    [OID.organizationalUnit, empty],
    [OID.organization, empty],
    [OID.locality, empty],
    [OID.state, empty],
    [OID.country, der.printable('')],
    [OID.emailAddress, der.ia5(email)],
  );
}

export interface CsrRequest {
  subject: Buffer;
  publicKey: KeyObject;
  privateKey: KeyObject;
  uris?: readonly string[];
}

/**
 * A PKCS#10 certification request in DER, signed SHA-512 with RSA. `uris` are
 * asked for as the subject's alternative names.
 */
export function certificationRequest(request: CsrRequest): Buffer {
  const { subject, publicKey, privateKey, uris = [] } = request;
  const info = der.sequence(
    der.integer(0),
    subject,
    publicKey.export({ format: 'der', type: 'spki' }),
    der.context(0, alternativeNames(uris)),
  );
  const algorithm = der.sequence(der.oid(OID.sha512WithRsa), der.nul());
  const signature = createSign('sha512').update(info).sign(privateKey);
  return der.sequence(info, algorithm, der.bitString(signature));
}

function alternativeNames(uris: readonly string[]): Buffer {
  if (uris.length === 0) return Buffer.alloc(0);
  const names = uris.map((uri) => der.encode(GENERAL_NAME_URI, Buffer.from(uri, 'ascii')));
  const extension = der.sequence(der.oid(OID.subjectAltName), der.octets(der.sequence(...names)));
  return der.sequence(der.oid(OID.extensionRequest), der.set(der.sequence(extension)));
}
