// Is this .p8 an APNs auth key, or an App Store Connect API key?
//
// Both download as AuthKey_XXXXXXXXXX.p8 and both are P-256 PKCS#8, so the file
// cannot tell you. Apple can: sign a provider token and push to a deliberately
// bogus device token. The rejection is the answer.
//
//   400 BadDeviceToken      -> the key IS a valid APNs key and the topic is right
//                              (only the device token was wrong, as intended)
//   403 InvalidProviderToken -> wrong kind of key, or wrong team
//   403 TopicDisallowed      -> valid APNs key, but not for this bundle id
//
// Nothing reaches a real device: the token is 64 zeros.

const [, , p8Path, keyId, teamId, topic] = process.argv;
if (!p8Path || !keyId || !teamId || !topic) {
  console.error('usage: probe-apns.ts <key.p8> <keyId> <teamId> <topic>');
  process.exit(2);
}

const pem = await Bun.file(p8Path).text();
const der = Uint8Array.from(
  atob(
    pem
      .replace(/-----BEGIN [^-]+-----/, '')
      .replace(/-----END [^-]+-----/, '')
      .replace(/\s+/g, ''),
  ),
  (c) => c.codePointAt(0) ?? 0,
);

const key = await crypto.subtle.importKey(
  'pkcs8',
  der,
  { name: 'ECDSA', namedCurve: 'P-256' },
  false,
  ['sign'],
);

const b64url = (b: ArrayBuffer | Uint8Array) => {
  const v = b instanceof Uint8Array ? b : new Uint8Array(b);
  const b64 = btoa(String.fromCodePoint(...v))
    .replaceAll('+', '-')
    .replaceAll('/', '_');
  // Linear padding strip; `/=+$/` backtracks at every position (see worker/jwt).
  let end = b64.length;
  while (end > 0 && b64[end - 1] === '=') end--;
  return b64.slice(0, end);
};
const enc = new TextEncoder();
const now = Math.floor(Date.now() / 1000);
const input = `${b64url(enc.encode(JSON.stringify({ alg: 'ES256', kid: keyId })))}.${b64url(
  enc.encode(JSON.stringify({ iss: teamId, iat: now })),
)}`;
const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(input));
const jwt = `${input}.${b64url(sig)}`;

// curl, not fetch: APNs refuses HTTP/1.1 outright and Bun's fetch cannot speak
// HTTP/2, the same reason the server uses kroma-http rather than a Rust client.
for (const [label, host] of [
  ['production', 'https://api.push.apple.com'],
  ['sandbox', 'https://api.sandbox.push.apple.com'],
] as const) {
  const proc = Bun.spawnSync([
    'curl',
    '-s',
    '--http2',
    '--max-time',
    '20',
    '-w',
    '\n[%{http_code}]',
    '-X',
    'POST',
    `${host}/3/device/${'0'.repeat(64)}`,
    '-H',
    `authorization: bearer ${jwt}`,
    '-H',
    `apns-topic: ${topic}`,
    '-H',
    'apns-push-type: alert',
    '-H',
    'apns-priority: 10',
    '-H',
    'content-type: application/json',
    '-d',
    JSON.stringify({ aps: { alert: { title: 'probe', body: 'probe' } } }),
  ]);
  console.log(`${label}: ${proc.stdout.toString().trim()}`);
}
