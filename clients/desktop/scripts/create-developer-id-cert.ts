// Set up the "Developer ID Application" certificate - the one that lets the
// macOS .dmg be signed and notarized, instead of shipping ad-hoc-signed and
// making every user strip the quarantine bit by hand.
//
// ONE STEP IS NOT AUTOMATABLE, and it is worth knowing why before trying:
// Apple answers `POST /v1/certificates` for this type with
//
//   403 - This request is forbidden for security reasons:
//         This operation can only be performed by the Account Holder.
//
// and "Account Holder" is a PERSON, not a role an App Store Connect API key can
// carry (a key is Admin, App Manager, Developer, ...). So no API key can mint a
// Developer ID certificate, however privileged - the one signing request has to
// be pasted into the developer portal by the account holder, in a browser.
//
// Everything either side of that is scripted here:
//
//   --csr                generate the private key + signing request
//   ( paste the .csr into developer.apple.com, download the .cer )
//   --import <cert.cer>  pair it with the key, build the .p12, install it, and
//                        print the exact `gh secret set` commands
//   --list               what the team already has (read-only)
//
// THE PRIVATE KEY NEVER LEAVES THIS MACHINE. The portal only ever sees the CSR,
// which carries the public half plus a proof of possession. Apple cannot reissue
// the private half if it is lost, so the .p12 that comes out of `--import` is
// the artifact to back up.
//
// --list needs an App Store Connect API key (any role):
//   ASC_KEY_ID=XXXXXXXXXX \
//   ASC_ISSUER_ID=aaaaaaaa-bbbb-... \
//   ASC_PRIVATE_KEY_PATH=~/Downloads/AuthKey_XXXXXXXXXX.p8 \
//     bun clients/desktop/scripts/create-developer-id-cert.ts --list
//
// --csr and --import need no credentials at all.

import { execFileSync } from 'node:child_process';
import { createSign } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const API = 'https://api.appstoreconnect.apple.com/v1';

/** Where the key, request and certificate live between the two steps. Outside
 * the repository on purpose: a .p12 is a private key, and a working tree is
 * exactly where one gets committed by accident. */
const DEFAULT_DIR = join(homedir(), '.kroma', 'developer-id');

function env(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. See the header of this file.`);
    process.exit(1);
  }
  return value;
}

function expandHome(p: string): string {
  return p.startsWith('~') ? join(homedir(), p.slice(1)) : p;
}

/**
 * An ES256 JWT for App Store Connect.
 *
 * `dsaEncoding: 'ieee-p1363'` is the whole trick: OpenSSL emits an ECDSA
 * signature as a DER SEQUENCE, and JWS wants the raw r‖s pair. Without it Apple
 * answers 401 on a signature that is otherwise perfectly valid.
 */
function token(keyId: string, issuerId: string, privateKey: string): string {
  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: issuerId,
    iat: now,
    exp: now + 15 * 60, // Apple rejects anything beyond 20 minutes out.
    aud: 'appstoreconnect-v1',
  };
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const signingInput = `${b64(header)}.${b64(payload)}`;
  const sig = createSign('SHA256')
    .update(signingInput)
    .sign({ key: privateKey, dsaEncoding: 'ieee-p1363' })
    .toString('base64url');
  return `${signingInput}.${sig}`;
}

interface CertResource {
  id: string;
  attributes: { certificateType: string; displayName: string; expirationDate?: string };
}

async function list(): Promise<void> {
  const jwt = token(
    env('ASC_KEY_ID'),
    env('ASC_ISSUER_ID'),
    readFileSync(expandHome(env('ASC_PRIVATE_KEY_PATH')), 'utf8'),
  );
  const res = await fetch(`${API}/certificates?limit=200`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`App Store Connect ${res.status}:`);
    console.error(text.slice(0, 600));
    process.exit(1);
  }
  const body = JSON.parse(text) as { data: CertResource[] };
  console.log(`\n${body.data.length} certificate(s) on this team:\n`);
  for (const c of body.data) {
    const a = c.attributes;
    const until = a.expirationDate ? `  (expires ${a.expirationDate.slice(0, 10)})` : '';
    console.log(`  ${a.certificateType.padEnd(32)} ${a.displayName}${until}`);
  }
  const devId = body.data.filter((c) => c.attributes.certificateType.startsWith('DEVELOPER_ID'));
  console.log(
    devId.length
      ? '\nA Developer ID certificate exists. If this Mac has its private key, export it\nfrom Keychain Access as a .p12 instead of minting another.'
      : '\nNo Developer ID certificate yet. Run --csr to start.',
  );
}

function csr(dir: string): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const keyFile = join(dir, 'developer-id.key');
  const csrFile = join(dir, 'developer-id.csr');
  if (existsSync(keyFile)) {
    console.error(
      `${keyFile} already exists. Delete it only if you are certain no issued\n` +
        'certificate depends on it - the private half cannot be reissued.',
    );
    process.exit(1);
  }
  // RSA 2048 / SHA-256 is what Apple accepts for this certificate.
  execFileSync('openssl', ['genrsa', '-out', keyFile, '2048'], { stdio: 'pipe' });
  execFileSync('chmod', ['600', keyFile]);
  execFileSync(
    'openssl',
    ['req', '-new', '-key', keyFile, '-out', csrFile, '-subj', '/CN=KROMA Developer ID/C=CH'],
    { stdio: 'pipe' },
  );
  console.log(`
Signing request ready.

  key   ${keyFile}   (never leaves this machine - back it up)
  csr   ${csrFile}

Next, in a browser signed in as the ACCOUNT HOLDER:

  1. https://developer.apple.com/account/resources/certificates/add
  2. Software > "Developer ID Application"
  3. Profile Type: G2 Sub-CA (the current one)
  4. Upload ${csrFile}
  5. Download the .cer

Then finish here:

  bun clients/desktop/scripts/create-developer-id-cert.ts --import ~/Downloads/developerID_application.cer
`);
}

function importCer(cerPath: string, dir: string): void {
  const keyFile = join(dir, 'developer-id.key');
  if (!existsSync(keyFile)) {
    console.error(`No private key at ${keyFile}. Run --csr first (on THIS machine).`);
    process.exit(1);
  }
  const cer = expandHome(cerPath);
  if (!existsSync(cer)) {
    console.error(`No such certificate: ${cer}`);
    process.exit(1);
  }

  const pemFile = join(dir, 'developer-id.pem');
  // The portal hands back DER; everything downstream wants PEM.
  execFileSync('openssl', ['x509', '-inform', 'DER', '-in', cer, '-out', pemFile], {
    stdio: 'pipe',
  });

  const password = crypto.randomUUID();
  const p12 = join(dir, 'kroma-developer-id.p12');
  // Keychain and `security import` want the pre-OpenSSL-3 PBE. OpenSSL 3 defaults
  // to AES-256-CBC + PBKDF2 and needs `-legacy` to go back; 1.1.1 and LibreSSL
  // (what macOS ships) already emit it and reject the flag outright. So ask the
  // binary which it is rather than assuming - guessing wrong fails the export.
  const openssl3 = execFileSync('openssl', ['version']).toString().startsWith('OpenSSL 3.');
  execFileSync('openssl', [
    'pkcs12',
    '-export',
    ...(openssl3 ? ['-legacy'] : []),
    '-inkey',
    keyFile,
    '-in',
    pemFile,
    '-out',
    p12,
    '-name',
    'KROMA Developer ID Application',
    '-passout',
    `pass:${password}`,
  ]);
  execFileSync('chmod', ['600', p12]);

  execFileSync('security', [
    'import',
    p12,
    '-k',
    join(homedir(), 'Library/Keychains/login.keychain-db'),
    '-P',
    password,
    '-T',
    '/usr/bin/codesign',
  ]);

  const identity = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'])
    .toString()
    .split('\n')
    .find((l) => l.includes('Developer ID Application'))
    ?.replace(/^[^"]*"([^"]*)".*$/, '$1');

  console.log(`
Installed.

  .p12       ${p12}
  password   ${password}
  identity   ${identity ?? '(not found - check `security find-identity -v -p codesigning`)'}

Back up the .p12 and its password: Apple cannot reissue the private half.

Repository secrets:

  gh secret set APPLE_CERTIFICATE < <(base64 -i "${p12}")
  gh secret set APPLE_CERTIFICATE_PASSWORD --body '${password}'
  gh secret set APPLE_SIGNING_IDENTITY --body '${identity ?? ''}'

Notarization additionally needs APPLE_ID, APPLE_TEAM_ID (already set) and
APPLE_PASSWORD - an app-specific password from appleid.apple.com, NOT the
account password.
`);
}

const args = process.argv.slice(2);
const dir = args.includes('--out') ? expandHome(args[args.indexOf('--out') + 1]) : DEFAULT_DIR;

if (args.includes('--list')) {
  await list();
} else if (args.includes('--csr')) {
  csr(dir);
} else if (args.includes('--import')) {
  const cer = args[args.indexOf('--import') + 1];
  if (!cer) {
    console.error('--import needs the path to the .cer downloaded from the portal.');
    process.exit(1);
  }
  importCer(cer, dir);
} else {
  console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n\n')[0]);
}
