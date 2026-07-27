#!/usr/bin/env python3
"""Report what App Store Connect holds for signing: certificates, bundle ids and
provisioning profiles. Read-only - it creates nothing.

Reads ASC_KEY_ID / ASC_ISSUER_ID from the environment and the private key from
$RUNNER_TEMP/asc.p8. Prints names, types and dates; never a credential.

The question it exists to answer is narrow: an App Store .ipa needs a
DISTRIBUTION certificate and an IOS_APP_STORE / TVOS_APP_STORE profile. When
those are absent, `xcodebuild -allowProvisioningUpdates` quietly mints a
DEVELOPMENT identity instead, the archive succeeds, and only the export fails -
with a message that blames the profile rather than the certificate.
"""

import json
import os
import time
import urllib.error
import urllib.request

API = "https://api.appstoreconnect.apple.com/v1"
WANTED_BUNDLE = "tv.kroma.mobile"


def token() -> str:
    """ES256 JWT, signed with the .p8. Hand-rolled so the script needs no pip
    install on a runner where every second counts."""
    try:
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import ec, utils
    except ImportError:
        raise SystemExit("::error::python cryptography is unavailable on this runner")

    import base64

    def b64(data: bytes) -> bytes:
        return base64.urlsafe_b64encode(data).rstrip(b"=")

    key_id, issuer = os.environ["ASC_KEY_ID"], os.environ["ASC_ISSUER_ID"]
    with open(f"{os.environ['RUNNER_TEMP']}/asc.p8", "rb") as fh:
        key = serialization.load_pem_private_key(fh.read(), password=None)

    header = b64(json.dumps({"alg": "ES256", "kid": key_id, "typ": "JWT"}).encode())
    now = int(time.time())
    claims = b64(
        json.dumps({"iss": issuer, "iat": now, "exp": now + 600, "aud": "appstoreconnect-v1"}).encode()
    )
    signing_input = header + b"." + claims
    der = key.sign(signing_input, ec.ECDSA(hashes.SHA256()))
    r, s = utils.decode_dss_signature(der)
    raw = r.to_bytes(32, "big") + s.to_bytes(32, "big")  # JOSE wants R||S, not DER
    return (signing_input + b"." + b64(raw)).decode()


def get(path: str, jwt: str) -> dict:
    req = urllib.request.Request(f"{API}/{path}", headers={"Authorization": f"Bearer {jwt}"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode()[:400]
        print(f"  ::error::{path} -> HTTP {exc.code} {detail}")
        return {"data": []}


def main() -> None:
    jwt = token()

    print("--- certificates on the account ---")
    certs = get("certificates?limit=200", jwt).get("data", [])
    if not certs:
        print("  (none)")
    distribution = 0
    for c in certs:
        a = c["attributes"]
        kind = a.get("certificateType", "?")
        if "DISTRIBUTION" in kind:
            distribution += 1
        print(f"  {kind:28} {a.get('displayName','?')}  expires {a.get('expirationDate','?')[:10]}")
    print(f"  => {distribution} distribution certificate(s)")

    print()
    print(f"--- profiles for {WANTED_BUNDLE} ---")
    profiles = get("profiles?limit=200&include=bundleId", jwt)
    ids = {
        b["id"]: b["attributes"]["identifier"]
        for b in profiles.get("included", [])
        if b["type"] == "bundleIds"
    }
    found = 0
    for p in profiles.get("data", []):
        bundle_ref = p.get("relationships", {}).get("bundleId", {}).get("data") or {}
        identifier = ids.get(bundle_ref.get("id"), "?")
        if identifier != WANTED_BUNDLE:
            continue
        found += 1
        a = p["attributes"]
        print(
            f"  {a.get('profileType','?'):22} {a.get('name','?')}  "
            f"state={a.get('profileState','?')}  expires {a.get('expirationDate','?')[:10]}"
        )
    if not found:
        print(f"  (no profiles at all for {WANTED_BUNDLE})")
    print()
    print("An App Store .ipa needs profileType IOS_APP_STORE (phone) and")
    print("TVOS_APP_STORE (Apple TV), each backed by a DISTRIBUTION certificate.")


if __name__ == "__main__":
    main()
