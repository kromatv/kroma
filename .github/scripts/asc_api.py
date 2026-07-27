"""Minimal App Store Connect API client: an ES256 JWT and three verbs.

Shared by asc-signing-report.py (read-only) and asc-mint-profiles.py (writes).
Hand-rolled rather than pulling in a JWT library, because these run on a CI
runner where `pip install` is a minute nobody gets back.

Credentials, all from the environment so nothing is ever passed on a command
line (where it would land in shell history and `ps`):
  ASC_KEY_ID, ASC_ISSUER_ID  - the key's id and the team's issuer id
  ASC_PRIVATE_KEY_PATH       - the .p8, defaulting to $RUNNER_TEMP/asc.p8
"""

import base64
import json
import os
import time
import urllib.error
import urllib.request

API = "https://api.appstoreconnect.apple.com/v1"


def _b64(data: bytes) -> bytes:
    return base64.urlsafe_b64encode(data).rstrip(b"=")


def token() -> str:
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec, utils

    key_id, issuer = os.environ["ASC_KEY_ID"], os.environ["ASC_ISSUER_ID"]
    path = os.environ.get("ASC_PRIVATE_KEY_PATH") or f"{os.environ['RUNNER_TEMP']}/asc.p8"
    with open(path, "rb") as fh:
        key = serialization.load_pem_private_key(fh.read(), password=None)

    header = _b64(json.dumps({"alg": "ES256", "kid": key_id, "typ": "JWT"}).encode())
    now = int(time.time())
    claims = _b64(
        json.dumps(
            {"iss": issuer, "iat": now, "exp": now + 600, "aud": "appstoreconnect-v1"}
        ).encode()
    )
    signing_input = header + b"." + claims
    r, s = utils.decode_dss_signature(key.sign(signing_input, ec.ECDSA(hashes.SHA256())))
    # JOSE wants the raw R||S pair, not the DER structure `sign` returns.
    raw = r.to_bytes(32, "big") + s.to_bytes(32, "big")
    return (signing_input + b"." + _b64(raw)).decode()


def _call(method: str, path: str, jwt: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Authorization": f"Bearer {jwt}"}
    if data:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(f"{API}/{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode()[:600]
        raise SystemExit(f"::error::{method} {path} -> HTTP {exc.code}\n{detail}") from exc


def get(path: str, jwt: str) -> dict:
    return _call("GET", path, jwt)


def post(path: str, jwt: str, body: dict) -> dict:
    return _call("POST", path, jwt, body)


def delete(path: str, jwt: str) -> dict:
    return _call("DELETE", path, jwt)
