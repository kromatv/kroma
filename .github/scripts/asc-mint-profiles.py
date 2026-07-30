#!/usr/bin/env python3
"""Mint fresh App Store provisioning profiles for tv.kroma.mobile, base64-encoded
for `gh secret set`. A profile goes state=INVALID the moment the App ID's
capabilities change and Apple does not re-issue it.

Usage:
  ASC_KEY_ID=... ASC_ISSUER_ID=... ASC_PRIVATE_KEY_PATH=AuthKey_X.p8 \
    python3 .github/scripts/asc-mint-profiles.py [--out DIR]

Then:
  gh secret set MOBILE_IOS_PROVISIONING_PROFILE < DIR/ios.b64
  gh secret set TVOS_PROVISIONING_PROFILE      < DIR/tvos.b64
"""

import argparse
import datetime
import os
import sys

import asc_api as asc

BUNDLE = "tv.kroma.mobile"
# (bundle id, profileType, output basename). Both platforms of one App Store
# record share the bundle id, so the app's two profiles differ only by platform.
# The Top Shelf extension is a SEPARATE App ID: without its own profile the tvOS
# archive signs it with a Team profile lacking group.tv.kroma and dies on an
# entitlements mismatch.
WANTED = [
    (BUNDLE, "IOS_APP_STORE", "ios"),
    (BUNDLE, "TVOS_APP_STORE", "tvos"),
    (f"{BUNDLE}.TopShelf", "TVOS_APP_STORE", "tvos-topshelf"),
]

# A profile only ever contains what the App ID had AT MINT TIME: minting against
# an App ID missing a capability produces a profile that installs cleanly and
# then fails the archive with "doesn't include the ... entitlement". Listed here
# rather than inferred from the entitlements, because enabling one changes the
# Apple ACCOUNT and should be a deliberate line in a diff. APP_GROUPS is absent
# on purpose: it has to be pointed at a specific group, so it stays manual.
REQUIRED_CAPABILITIES = {
    BUNDLE: ["PUSH_NOTIFICATIONS"],
}


def ensure_capabilities(bundle: str, bundle_id: str, jwt: str) -> bool:
    wanted = REQUIRED_CAPABILITIES.get(bundle, [])
    if not wanted:
        return False
    # No `limit` here, unlike every other GET in this file: Apple rejects it on
    # THIS relationship with a 400 ("The parameter 'limit' can not be used with
    # this request"). It returns every capability unpaged.
    have = {
        c["attributes"]["capabilityType"]
        for c in asc.get(f"bundleIds/{bundle_id}/bundleIdCapabilities", jwt).get("data", [])
        if c.get("attributes", {}).get("capabilityType")
    }
    changed = False
    for capability in wanted:
        if capability in have:
            continue
        asc.post(
            "bundleIdCapabilities",
            jwt,
            {
                "data": {
                    "type": "bundleIdCapabilities",
                    "attributes": {"capabilityType": capability},
                    "relationships": {
                        "bundleId": {"data": {"type": "bundleIds", "id": bundle_id}}
                    },
                }
            },
        )
        print(f"  enabled {capability} on {bundle}")
        changed = True
    return changed


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=".", help="where to write the .b64 files")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    jwt = asc.token()

    # `filter[identifier]` is a PREFIX match, not an exact one: asking for
    # tv.kroma.mobile also returns tv.kroma.mobile.TopShelf. One query covers
    # both; each identifier is matched exactly below.
    found = {
        b["attributes"]["identifier"]: b["id"]
        for b in asc.get(f"bundleIds?filter[identifier]={BUNDLE}&limit=200", jwt).get("data", [])
    }

    certs = [
        c
        for c in asc.get("certificates?limit=200", jwt).get("data", [])
        if "DISTRIBUTION" in c["attributes"].get("certificateType", "")
    ]
    if not certs:
        print("::error::no distribution certificate on the account; a profile cannot be minted")
        return 1
    # Newest by expiry: after a rotation the freshest is the one CI holds.
    certs.sort(key=lambda c: c["attributes"].get("expirationDate", ""), reverse=True)
    cert_id = certs[0]["id"]
    print(f"using certificate {certs[0]['attributes'].get('displayName','?')}")

    # Capabilities FIRST, for every App ID: enabling one invalidates every
    # existing profile for that App ID, including any minted earlier in a loop.
    for bundle in {b for b, _, _ in WANTED}:
        bundle_id = found.get(bundle)
        if bundle_id:
            ensure_capabilities(bundle, bundle_id, jwt)

    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d")
    for bundle, profile_type, basename in WANTED:
        bundle_id = found.get(bundle)
        if not bundle_id:
            print(f"::error::no App ID registered for {bundle}")
            return 1
        # The bundle id is IN the name so the app's profile cannot be mistaken
        # for the extension's; Apple rejects duplicate names outright (409).
        name = f"KROMA {bundle} {profile_type} CI {stamp}"
        body = {
            "data": {
                "type": "profiles",
                "attributes": {"name": name, "profileType": profile_type},
                "relationships": {
                    "bundleId": {"data": {"type": "bundleIds", "id": bundle_id}},
                    "certificates": {"data": [{"type": "certificates", "id": cert_id}]},
                },
            }
        }
        # Re-runnable: a same-day rerun would hit the 409 on the duplicate name,
        # so an existing profile of this exact name is reused instead.
        same_name = [
            p
            for p in asc.get("profiles?limit=200", jwt).get("data", [])
            if p["attributes"].get("name") == name
        ]
        existing = next(
            (p for p in same_name if p["attributes"].get("profileState") == "ACTIVE"), None
        )
        # A same-named INVALID profile can neither be reused nor left in place
        # (409 on the duplicate name), and it can sign nothing anyway.
        if not existing:
            for dead in same_name:
                asc.delete(f"profiles/{dead['id']}", jwt)
                print(f"  (removed the invalidated profile of this name: {dead['id']})")
        attrs = (existing or asc.post("profiles", jwt, body)["data"])["attributes"]
        if existing:
            print("  (reusing the still-ACTIVE profile of this name)")
        # profileContent IS the .mobileprovision, already base64 - the form the
        # GitHub secret holds, so it is written through untouched.
        path = f"{args.out}/{basename}.b64"
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(attrs["profileContent"])
        print(f"  {profile_type:16} {name}  state={attrs.get('profileState','?')} -> {path}")

    print()
    print("Now update the secrets:")
    print(f"  gh secret set MOBILE_IOS_PROVISIONING_PROFILE     < {args.out}/ios.b64")
    print(f"  gh secret set TVOS_PROVISIONING_PROFILE           < {args.out}/tvos.b64")
    print(f"  gh secret set TVOS_TOPSHELF_PROVISIONING_PROFILE  < {args.out}/tvos-topshelf.b64")
    return 0


if __name__ == "__main__":
    sys.exit(main())
