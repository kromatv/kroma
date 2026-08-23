import { createSign, type KeyObject, randomBytes } from 'node:crypto';
import * as der from './asn1';

const OID = {
  commonName: '2.5.4.3',
  organization: '2.5.4.10',
  organizationalUnit: '2.5.4.11',
  locality: '2.5.4.7',
  state: '2.5.4.8',
  country: '2.5.4.6',
  sha256WithRsa: '1.2.840.113549.1.1.11',
  basicConstraints: '2.5.29.19',
  keyUsage: '2.5.29.15',
} as const;

const SERIAL_BYTES = 8;
const DAY_MS = 86_400_000;
// digitalSignature and keyEncipherment, the two an author certificate signs with.
const KEY_USAGE_BITS = Buffer.from([0xa0]);
const KEY_USAGE_UNUSED = 5;

export interface Subject {
  commonName: string;
  organization?: string;
  organizationalUnit?: string;
  locality?: string;
  state?: string;
  country?: string;
}

export interface CertificateRequest {
  subject: Subject;
  publicKey: KeyObject;
  privateKey: KeyObject;
  days: number;
  from?: Date;
}

/** A self-signed X.509 v3 certificate, in DER. */
export function selfSignedCertificate(request: CertificateRequest): Buffer {
  const { subject, publicKey, privateKey, days } = request;
  const from = request.from ?? new Date();
  const until = new Date(from.getTime() + days * DAY_MS);

  const algorithm = der.sequence(der.oid(OID.sha256WithRsa), der.nul());
  const name = distinguishedName(subject);
  const tbs = der.sequence(
    der.context(0, der.integer(2)),
    der.integer(randomBytes(SERIAL_BYTES)),
    algorithm,
    name,
    der.sequence(der.utcTime(from), der.utcTime(until)),
    name,
    publicKey.export({ format: 'der', type: 'spki' }),
    der.context(3, der.sequence(...extensions())),
  );

  const signature = createSign('sha256').update(tbs).sign(privateKey);
  return der.sequence(tbs, algorithm, der.bitString(signature));
}

export function toPem(contents: Buffer, label: string): string {
  const body = contents.toString('base64').match(/.{1,64}/g) ?? [];
  return [`-----BEGIN ${label}-----`, ...body, `-----END ${label}-----`, ''].join('\n');
}

function extensions(): Buffer[] {
  return [
    extension(OID.basicConstraints, der.sequence()),
    extension(OID.keyUsage, der.bitString(KEY_USAGE_BITS, KEY_USAGE_UNUSED)),
  ];
}

function extension(id: string, value: Buffer): Buffer {
  return der.sequence(der.oid(id), der.boolean(true), der.octets(value));
}

function distinguishedName(subject: Subject): Buffer {
  const parts: Buffer[] = [];
  const add = (id: string, value: string | undefined, printable = false) => {
    if (!value) return;
    const text = printable ? der.printable(value) : der.utf8(value);
    parts.push(der.set(der.sequence(der.oid(id), text)));
  };

  add(OID.country, subject.country?.toUpperCase(), true);
  add(OID.state, subject.state);
  add(OID.locality, subject.locality);
  add(OID.organization, subject.organization);
  add(OID.organizationalUnit, subject.organizationalUnit);
  add(OID.commonName, subject.commonName);
  return der.sequence(...parts);
}
