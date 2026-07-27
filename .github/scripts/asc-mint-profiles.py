#!/usr/bin/env python3
"""Mint fresh App Store provisioning profiles for tv.kroma.mobile and write them
out base64-encoded, ready for `gh secret set`.

Why this exists: a profile goes state=INVALID the moment the App ID's
capabilities change - adding an App Group or SiriKit is enough - and Apple does
not re-issue it. The stored secret still decodes and still looks right (correct
type, correct app id, expiry in 2027), so the failure surfaces far away from the
cause: `xcodebuild -allowProvisioningUpdates` quietly mints a DEVELOPMENT
identity instead, the archive succeeds, and only `exportArchive` fails with
"No profiles for 'tv.kroma.mobile' were found".

Creates rather than replaces. The invalid profiles are left alone - Apple
retires them on its own - so this is re-runnable and never destroys something
that turns out to have been in use. Names carry the date to stay unique, since
Apple rejects a duplicate profile name.

Usage:
  ASC_KEY_ID=... ASC_ISSUER_ID=... ASC_PRIVATE_KEY_PATH=AuthKey_X.p8 \
    python3 .github/scripts/asc-mint-profiles.py [--out DIR]

Then:
  gh secret set MOBILE_IOS_PROVISIONING_PROFILE < DIR/ios.b64
  gh secret set TVOS_PROVISIONING_PROFILE      < DIR/tvos.b64
"""

import argparse
import datetime
import sys

import asc_api as asc

BUNDLE = "tv.kroma.mobile"
# (profileType, output basename). Both platforms of one App Store record share
# the bundle id - see clients/tv-native/app.config.js - so they differ only by
# the platform the profile is minted for.
WANTED = [("IOS_APP_STORE", "ios"), ("TVOS_APP_STORE", "tvos")]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=".", help="where to write the .b64 files")
    args = ap.parse_args()

    jwt = asc.token()

    # `filter[identifier]` is a PREFIX match, not an exact one: asking for
    # tv.kroma.mobile also returns tv.kroma.mobile.TopShelf, and the extension
    # sorts first. Taking [0] mints a perfectly valid, perfectly useless profile
    # for the Top Shelf extension - which decodes and installs cleanly, so the
    # build fails later with the same "no profiles" message it started with.
    # Match the identifier here rather than trusting the server's filter.
    bundles = [
        b
        for b in asc.get(f"bundleIds?filter[identifier]={BUNDLE}&limit=200", jwt).get("data", [])
        if b["attributes"]["identifier"] == BUNDLE
    ]
    if not bundles:
        print(f"::error::no App ID registered for {BUNDLE}")
        return 1
    bundle_id = bundles[0]["id"]
    print(f"using App ID {BUNDLE} ({bundle_id})")

    certs = [
        c
        for c in asc.get("certificates?limit=200", jwt).get("data", [])
        if "DISTRIBUTION" in c["attributes"].get("certificateType", "")
    ]
    if not certs:
        print("::error::no distribution certificate on the account; a profile cannot be minted")
        return 1
    # Newest by expiry: if the team has rotated, the freshest is the one CI holds.
    certs.sort(key=lambda c: c["attributes"].get("expirationDate", ""), reverse=True)
    cert_id = certs[0]["id"]
    print(f"using certificate {certs[0]['attributes'].get('displayName','?')}")

    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d")
    for profile_type, basename in WANTED:
        # The bundle id is IN the name because the account also carries
        # tv.kroma.mobile.TopShelf, and a name that does not say which App ID it
        # belongs to is how a profile for the extension ends up looking like the
        # profile for the app. Apple rejects duplicate names outright (409), so
        # the collision surfaces immediately rather than as a silent wrong pick.
        name = f"KROMA {BUNDLE} {profile_type} CI {stamp}"
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
        created = asc.post("profiles", jwt, body)["data"]
        attrs = created["attributes"]
        # profileContent IS the .mobileprovision, already base64 - which is
        # exactly the form the GitHub secret holds, so it is written through
        # untouched rather than decoded and re-encoded.
        path = f"{args.out}/{basename}.b64"
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(attrs["profileContent"])
        print(f"  {profile_type:16} {name}  state={attrs.get('profileState','?')} -> {path}")

    print()
    print("Now update the secrets:")
    print(f"  gh secret set MOBILE_IOS_PROVISIONING_PROFILE < {args.out}/ios.b64")
    print(f"  gh secret set TVOS_PROVISIONING_PROFILE      < {args.out}/tvos.b64")
    return 0


if __name__ == "__main__":
    sys.exit(main())
