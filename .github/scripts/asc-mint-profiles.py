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
# (bundle id, profileType, output basename).
#
# Both platforms of one App Store record share the bundle id - see
# clients/tv-native/app.config.js - so the app's two profiles differ only by the
# platform they are minted for.
#
# The Top Shelf extension is a SEPARATE App ID and needs its own profile. The
# tvOS archive builds two targets, and manual signing has to name a profile for
# each; without this one the extension falls back to a Team profile that does
# not carry group.tv.kroma, and the archive dies on an entitlements mismatch.
WANTED = [
    (BUNDLE, "IOS_APP_STORE", "ios"),
    (BUNDLE, "TVOS_APP_STORE", "tvos"),
    (f"{BUNDLE}.TopShelf", "TVOS_APP_STORE", "tvos-topshelf"),
]


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
    # One prefix query covers the app AND its extension, then each is matched
    # exactly below.
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
    # Newest by expiry: if the team has rotated, the freshest is the one CI holds.
    certs.sort(key=lambda c: c["attributes"].get("expirationDate", ""), reverse=True)
    cert_id = certs[0]["id"]
    print(f"using certificate {certs[0]['attributes'].get('displayName','?')}")

    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d")
    for bundle, profile_type, basename in WANTED:
        bundle_id = found.get(bundle)
        if not bundle_id:
            print(f"::error::no App ID registered for {bundle}")
            return 1
        # The bundle id is IN the name because the account also carries
        # tv.kroma.mobile.TopShelf, and a name that does not say which App ID it
        # belongs to is how a profile for the extension ends up looking like the
        # profile for the app. Apple rejects duplicate names outright (409), so
        # the collision surfaces immediately rather than as a silent wrong pick.
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
        # Re-runnable: Apple rejects a duplicate name with a 409, and a second
        # run on the same day would otherwise fail after having done real work.
        # An existing profile of this exact name is the one this run would have
        # created, so reuse it rather than inventing a name to dodge the clash.
        same_name = [
            p
            for p in asc.get("profiles?limit=200", jwt).get("data", [])
            if p["attributes"].get("name") == name
        ]
        existing = next(
            (p for p in same_name if p["attributes"].get("profileState") == "ACTIVE"), None
        )
        # A same-named INVALID profile is the common case on a re-run: enabling a
        # capability invalidates every profile for the App ID, including one this
        # script minted minutes earlier. It cannot be reused and it cannot be left
        # alone either - Apple rejects the duplicate name with a 409 - and an
        # invalid profile can sign nothing, so removing it costs nothing.
        if not existing:
            for dead in same_name:
                asc.delete(f"profiles/{dead['id']}", jwt)
                print(f"  (removed the invalidated profile of this name: {dead['id']})")
        attrs = (existing or asc.post("profiles", jwt, body)["data"])["attributes"]
        if existing:
            print("  (reusing the still-ACTIVE profile of this name)")
        # profileContent IS the .mobileprovision, already base64 - which is
        # exactly the form the GitHub secret holds, so it is written through
        # untouched rather than decoded and re-encoded.
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
