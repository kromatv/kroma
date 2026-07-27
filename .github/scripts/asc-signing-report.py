#!/usr/bin/env python3
"""Report what App Store Connect holds for signing: certificates and the
provisioning profiles for tv.kroma.mobile. Read-only - it creates nothing.

The question it exists to answer is narrow, and the stored secrets cannot answer
it: a profile keeps decoding perfectly - right type, right app id, expiry years
away - after Apple has marked it state=INVALID. Only the account knows. That is
the state that makes `xcodebuild -allowProvisioningUpdates` mint a DEVELOPMENT
identity instead, so the archive succeeds and `exportArchive` fails with
"No profiles for 'tv.kroma.mobile' were found".

Prints names, types, states and dates; never a credential.
"""

import asc_api as asc

BUNDLE = "tv.kroma.mobile"


def main() -> None:
    jwt = asc.token()

    print("--- certificates on the account ---")
    certs = asc.get("certificates?limit=200", jwt).get("data", [])
    distribution = 0
    for c in certs or []:
        a = c["attributes"]
        kind = a.get("certificateType", "?")
        distribution += "DISTRIBUTION" in kind
        print(f"  {kind:28} {a.get('displayName','?')}  expires {a.get('expirationDate','?')[:10]}")
    if not certs:
        print("  (none)")
    print(f"  => {distribution} distribution certificate(s)")

    print()
    print(f"--- profiles for {BUNDLE} ---")
    profiles = asc.get("profiles?limit=200&include=bundleId", jwt)
    ids = {
        b["id"]: b["attributes"]["identifier"]
        for b in profiles.get("included", [])
        if b["type"] == "bundleIds"
    }
    found = invalid = 0
    for p in profiles.get("data", []):
        ref = (p.get("relationships", {}).get("bundleId", {}).get("data") or {}).get("id")
        if ids.get(ref) != BUNDLE:
            continue
        found += 1
        a = p["attributes"]
        state = a.get("profileState", "?")
        invalid += state != "ACTIVE"
        print(
            f"  {a.get('profileType','?'):22} {a.get('name','?')}  "
            f"state={state}  expires {a.get('expirationDate','?')[:10]}"
        )
    if not found:
        print(f"  (no profiles at all for {BUNDLE})")

    print()
    print("An App Store .ipa needs an ACTIVE IOS_APP_STORE (phone) and TVOS_APP_STORE")
    print("(Apple TV) profile, each backed by a DISTRIBUTION certificate.")
    if invalid:
        print()
        print(f"::warning::{invalid} profile(s) are not ACTIVE. Apple invalidates every")
        print("profile for an App ID when its capabilities change and does not re-issue")
        print("them. Mint replacements: .github/scripts/asc-mint-profiles.py")


if __name__ == "__main__":
    main()
