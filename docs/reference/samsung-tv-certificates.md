# Samsung TV certificates: how Samsung issues them

What the TV installer relies on when it gets a Samsung TV's certificates
without Tizen Studio (`packages/installer/src/platforms/tizen/samsung`). Each
fact names its source and how it is known. Read 2026-11-10.

Nothing here comes from taking Samsung's programs apart. Samsung publishes the
client side itself, under Apache-2.0.

## Sources

- **S1**: [Samsung/tizen-agent-skills](https://github.com/Samsung/tizen-agent-skills)
  at `edf0bf74`, Apache-2.0, Samsung's own tooling for its TV SDK.
  `tizen-sdk-skills/common/lib/core/samsung-auth.js`, `samsung-api.js`,
  `samsung-cert.js` and `assets/samsung-tv-ca/`.
- **S2**: [Samsung/webIDE-common-tizentv](https://github.com/Samsung/webIDE-common-tizentv)
  at `0d05cdcf`, Apache-2.0, the library behind Samsung's VS Code extension.
  `lib/samsungCertificateManager.js`. It names the older service
  `dev.tizen.samsung.com/apis/v2`.
- **O**: observed on one machine: the files Tizen Studio 6's Certificate Manager
  left in `~/SamsungCertificate/<profile>/` in June 2026, read with
  `openssl req -text` and `openssl asn1parse`.
- **H**: seen on hardware, recorded in react-native-tizen's
  `docs/reference/tizen-package-signing.md` and `sdb-protocol.md`: a
  GQ75LS03DAUXZG, Tizen 9.0.

## Why Samsung has to issue both

- A retail TV installs a package only when its author and its distributor
  signature both chain to Samsung. A self-signed author under Samsung's
  distributor was refused: `Invalid certificate chain with certificate in
  signature` (H).
- The distributor certificate lists the TVs it is good for, by DUID, as
  alternative names `URI:URN:tizen:deviceid=<duid>` after an empty
  `URI:URN:tizen:packageid=` (S1 `buildDistributorSanConfig`, S2
  `generateDistributorCSR`, O).
- A TV prints its DUID to `shell:0 getduid` over sdb (H, S1
  `samsung-duid.js`).
- Both certificates are valid for one year (O).

## Signing in

- The account signs in at
  `https://account.samsung.com/mobile/account/check.do?serviceID=v285zxnl3h&actionID=StartOAuth2&accessToken=Y&redirect_uri=<callback>`
  (S1 `runOAuthFlow`).
- The callback is `http://localhost:<port>/signin/callback`, on the first free
  port from 4794 to 4813, and Samsung's tool listens on `127.0.0.1` only (S1).
- Samsung sends the answer to the callback as a form field `code`, or as a
  `code` query parameter. Its value is JSON with `access_token`, `userId`,
  `inputEmailID` and `access_token_expires_in` (S1 `extractAuthCode`).
- Samsung's tool waits five minutes for it (S1).

## Asking for the certificates

All three requests are `multipart/form-data` POSTs to
`https://svdca.samsungqbe.com`, with the request as a file part `csr` of type
`application/octet-stream` (S1 `samsung-api.js`).

| Request | Path | Fields | Answer |
|---|---|---|---|
| Author | `/apis/v3/authors` | `access_token`, `user_id`, `platform=VD`, `csr` (`author.csr`) | the certificate, PEM |
| Register the TVs | `/apis/v1/distributors` | `access_token`, `user_id`, `privilege_level=Public`, `developer_type=Individual`, `platform=VD`, `csr` (`distributor.csr`) | the device profile, XML |
| Distributor | `/apis/v3/distributors` | the same without `platform` | the certificate, PEM |

- Samsung's tool makes the two distributor requests in that order with the same
  request file (S1 `submitDistributorCsr`).
- HTTP 403 means Samsung is rate limiting (S1 `sendRequest`).
- The service's TLS certificate verifies against the public roots, read with
  `curl` on 2026-11-10. S1 turns verification off; this tool leaves it on.

## The request files

- RSA 2048, signed SHA-512 with RSA (S1 `-sha512`, O).
- Author subject as the Certificate Manager writes it: `C`, `ST`, `L`, `O`,
  `OU` as empty PrintableStrings, then `CN` (O). No attribute.
- Distributor subject as the Certificate Manager writes it: `CN=TizenSDK`,
  then `OU`, `O`, `L`, `ST` as empty UTF8Strings, an empty PrintableString
  `C`, and `emailAddress` as an IA5String holding the account's address (O).
  S1 sends `CN=TizenSDK` alone. One `extensionRequest` attribute asks for the
  alternative names above.
- The requests this tool builds have the same ASN.1 structure as O: the same
  types in the same order, compared with `openssl asn1parse`.

## The chain

- Samsung answers with the leaf alone, and it carries no authority information
  access (O). A signature has to carry the issuer too.
- The author certificate is issued by `Samsung VD Author CA`, under `Tizen
  Developers Root Class`. A Public distributor certificate is issued by `VD
  DEVELOPER Public CA Class`, under `VD DEVELOPER Public Root Class` (O).
- Samsung publishes both issuers in S1 `assets/samsung-tv-ca`:
  `vd_tizen_dev_author_ca.cer`, SHA-256
  `50:79:19:6A:1C:32:87:2A:8B:CE:74:52:3F:C1:2A:D3:55:7E:2D:87:C5:6F:AF:BA:7C:6D:09:DC:ED:13:B7:10`,
  valid 2025-06-19 to 2040, and `vd_tizen_dev_public2.crt`, SHA-256
  `BF:18:85:9E:B0:24:CC:1D:63:F0:08:DC:DD:D6:43:07:7B:0D:E5:3E:95:8F:35:99:3F:F0:08:8D:1A:1D:31:AE`,
  valid 2025-06-17 to 2029. They are the files Tizen Studio 6 ships, by the
  same fingerprints (O). `samsung/authorities.ts` embeds them.

## Not known

- Whether a TV takes an update signed by a renewed author certificate with a
  new key. The tool keeps an author certificate until it expires, and has not
  been through a renewal.
- Whether the old TVs that ask for a device profile on the set (the "Permit to
  install applications" step of Tizen Studio's Device Manager) still need it.
  The tool keeps the profile Samsung answers and sends nothing to the TV.
