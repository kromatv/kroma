#!/usr/bin/env python3
"""Mint fresh App Store provisioning profiles for tv.kroma.app, base64-encoded
for `gh secret set`. A profile goes state=INVALID the moment the App ID's
capabilities change and Apple does not re-issue it.

Usage:
  ASC_KEY_ID=... ASC_ISSUER_ID=... ASC_PRIVATE_KEY_PATH=AuthKey_X.p8 \
    python3 .github/scripts/asc-mint-profiles.py [--out DIR] [--only ios,tvos]

Then:
  gh secret set MOBILE_IOS_PROVISIONING_PROFILE --env release < DIR/ios.b64
  gh secret set TVOS_PROVISIONING_PROFILE --env release      < DIR/tvos.b64
"""

import argparse
import datetime
import os
import sys
import urllib.parse

import asc_api as asc

BUNDLE = "tv.kroma.app"
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

SECRET_OF = {
    "ios": "MOBILE_IOS_PROVISIONING_PROFILE",
    "tvos": "TVOS_PROVISIONING_PROFILE",
    "tvos-topshelf": "TVOS_TOPSHELF_PROVISIONING_PROFILE",
}

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
    ap.add_argument(
        "--only",
        default="",
        help="comma-separated output basenames to mint (ios, tvos, tvos-topshelf); all when empty",
    )
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    only = {name for name in args.only.split(",") if name}
    unknown = only - {basename for _, _, basename in WANTED}
    if unknown:
        print(f"::error::--only names no profile: {', '.join(sorted(unknown))}")
        return 1
    wanted = [w for w in WANTED if not only or w[2] in only]

    jwt = asc.token()

    # `filter[identifier]` is a PREFIX match, not an exact one: asking for
    # tv.kroma.app also returns tv.kroma.app.TopShelf. One query covers
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
    for bundle in {b for b, _, _ in wanted}:
        bundle_id = found.get(bundle)
        if bundle_id:
            ensure_capabilities(bundle, bundle_id, jwt)

    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d")
    for bundle, profile_type, basename in wanted:
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
        # so an existing profile of this exact name is reused instead. Asked for
        # by name, because the account holds more profiles than one page lists.
        listed = asc.get(f"profiles?filter[name]={urllib.parse.quote(name)}&limit=200", jwt)
        same_name = sorted(
            (p for p in listed.get("data", []) if p["attributes"].get("name") == name),
            key=lambda p: p["id"],
        )
        existing = next(
            (p for p in same_name if p["attributes"].get("profileState") == "ACTIVE"), None
        )
        # Every other profile of this name goes: it signs nothing this run
        # uses, and while it holds the name Apple refuses a new one (409).
        for spare in same_name:
            if spare is existing:
                continue
            try:
                asc.delete(f"profiles/{spare['id']}", jwt)
                print(f"  (removed a spare profile of this name: {spare['id']})")
            except SystemExit:
                print(f"  (a spare profile of this name was already gone: {spare['id']})")
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
    for _, _, basename in wanted:
        print(f"  gh secret set {SECRET_OF[basename]} --env release < {args.out}/{basename}.b64")
    return 0


if __name__ == "__main__":
    sys.exit(main())
