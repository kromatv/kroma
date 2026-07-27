#!/usr/bin/env python3
"""Pin ONE target's code signing in a generated Xcode project.

Usage: pin-target-signing.py <project.pbxproj> <bundle-id> <profile-name>

Why a script and not a build setting: a setting passed to `xcodebuild` applies to
EVERY target. The Apple TV app builds two - KROMA and KromaTopShelf - under
different bundle ids, and Apple issues a profile per bundle id, so one
PROVISIONING_PROFILE_SPECIFIER on the command line hands the extension the app's
profile and fails exactly the way automatic signing already does.

Why it has to happen at all: automatic signing does not merely pick the wrong
profile, it MINTS. Given `-allowProvisioningUpdates` and an API key, xcodebuild
ignores the App Store profile installed a step earlier, creates itself an "Apple
Development: Created via API" certificate, signs with that, and the archive
succeeds - only the App Store export fails, blaming the profile. Enough failed
runs and the account hits Apple's certificate ceiling and nothing can sign.

The project is `expo prebuild` output, regenerated on every cold run, so editing
it is safe: nothing here is committed, and the edit is re-applied each build.
"""

import re
import sys

# Signing keys are rewritten rather than appended, so re-running is a no-op
# rather than an accumulation of duplicates.
MANAGED = ("CODE_SIGN_STYLE", "CODE_SIGN_IDENTITY", "PROVISIONING_PROFILE_SPECIFIER")


def pin(src: str, bundle: str, profile: str) -> tuple[str, int]:
    """Rewrite signing in every buildSettings block owning `bundle`."""
    marker = f"PRODUCT_BUNDLE_IDENTIFIER = {bundle};"
    # Split keeping the delimiter so each chunk after one is a single block's body.
    parts = re.split(r"(buildSettings = \{)", src)
    changed = 0
    for i, chunk in enumerate(parts):
        if marker not in chunk:
            continue
        # Drop any existing managed keys in this block, then insert ours once.
        for key in MANAGED:
            chunk = re.sub(rf"\n\s*{key} = (?:\"[^\"]*\"|[^;]+);", "", chunk)
        chunk = chunk.replace(
            marker,
            marker
            + f'\n\t\t\t\tCODE_SIGN_STYLE = Manual;'
            + f'\n\t\t\t\tCODE_SIGN_IDENTITY = "Apple Distribution";'
            + f'\n\t\t\t\tPROVISIONING_PROFILE_SPECIFIER = "{profile}";',
            1,
        )
        parts[i] = chunk
        changed += 1
    return "".join(parts), changed


def main() -> int:
    path, bundle, profile = sys.argv[1], sys.argv[2], sys.argv[3]
    with open(path, encoding="utf-8") as fh:
        src = fh.read()
    out, changed = pin(src, bundle, profile)
    if not changed:
        print(f"::error::no build configuration found for {bundle} in {path}")
        return 1
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(out)
    print(f"pinned {changed} configuration(s) for {bundle} -> '{profile}'")
    return 0


if __name__ == "__main__":
    sys.exit(main())
