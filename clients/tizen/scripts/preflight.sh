#!/usr/bin/env sh
# KROMA Tizen deploy preflight: catch the failures that `tizen install` only ever
# reports as an opaque code, and say them in plain words *before* the install runs.
#
# The headline case (#86): a retail set older than config.xml's required_version
# refuses the widget with `install failed[118]` / "Failed to install", no readable
# reason. required_version="6.0" floors the app at Tizen 6.0 (2021); a 2017 set is
# Tizen 3.0 and will never take it. We read the connected set's platform version
# and gate on it, so the developer learns the set is unsupported instead of staring
# at a code. The floor is a product decision, not a bug: the web build assumes a
# Chromium far newer than Tizen 3.0 ships (see tv.target.ts / STORE.md).
#
# POSIX sh, no dependencies beyond the tizen/sdb tools already required. Every probe
# is best-effort: it attempts, and on any missing tool or TV degrades to a single
# "skipped: <why>" line rather than failing, so `make doctor` is always runnable.
#
# Exit status is non-zero ONLY for a hard, confirmed blocker (a set below the floor)
# so the install/deploy path can stop early; unknowns and secondary findings never
# block. Env in: SDB, TIZEN, SERIAL, PROFILE, PKG_ID, TIZEN_HOME, CONFIG.
set -eu

SDB="${SDB:-sdb}"
TIZEN="${TIZEN:-tizen}"
SERIAL="${SERIAL:-}"
PROFILE="${PROFILE:-}"
PKG_ID="${PKG_ID:-}"
TIZEN_HOME="${TIZEN_HOME:-$HOME/tizen-studio}"
CONFIG="${CONFIG:-public/config.xml}"
WGT="${WGT:-}"

blocked=0

# The floor that matters is the one inside the archive about to be installed:
# `make install` takes the newest dist/*.wgt and does not repackage, so a widget
# built before the source manifest changed still carries the old value, and
# checking the source would pass it straight into the opaque failure this script
# exists to pre-empt. Falls back to the source when there is no archive yet.
read_required() {
  if [ -n "$WGT" ] && [ -f "$WGT" ] && command -v unzip >/dev/null 2>&1; then
    unzip -p "$WGT" config.xml 2>/dev/null \
      | sed -n 's/.*required_version="\([0-9.]*\)".*/\1/p' | head -1
    return
  fi
  sed -n 's/.*required_version="\([0-9.]*\)".*/\1/p' "$CONFIG" 2>/dev/null | head -1
}

# True when version $1 is strictly lower than $2 (dot-separated, numeric per field).
ver_lt() {
  have="$1"
  want="$2"
  [ "$have" = "$want" ] && return 1
  lowest=$(printf '%s\n%s\n' "$have" "$want" | sort -t. -k1,1n -k2,2n -k3,3n | head -1)
  [ "$lowest" = "$have" ]
}

# --- Primary: connected set's platform version vs the app's required_version ------
required=$(read_required)
if [ -z "$required" ]; then
  echo "  ~ platform floor: skipped: no required_version in ${WGT:-$CONFIG}"
elif [ -z "$SERIAL" ]; then
  echo "  ~ platform floor: skipped: no TV connected (app requires Tizen >= $required)"
else
  tv_ver=$("$SDB" -s "$SERIAL" capability 2>/dev/null \
    | sed -n 's/^platform_version:\([0-9.]*\).*/\1/p' | head -1)
  if [ -z "$tv_ver" ]; then
    echo "  ~ platform floor: skipped: could not read platform_version from $SERIAL"
  elif ver_lt "$tv_ver" "$required"; then
    echo "  ✗ this TV is Tizen $tv_ver; KROMA requires >= $required, this set is not supported"
    echo "    (the floor is config.xml's required_version. See SETUP.md.)"
    blocked=1
  else
    echo "  ✓ platform floor: TV is Tizen $tv_ver (>= required $required)"
  fi
fi

# --- Secondary: signing profile looks like a Samsung cert, not self-signed --------
# Retail sets only take a Samsung author+distributor cert; a self-signed profile
# (make cert-selfsigned) installs on the emulator only. Best-effort: read the
# author cert out of the profile and check its issuer with openssl when present.
profiles="$TIZEN_HOME-data/profile/profiles.xml"
if [ -z "$PROFILE" ] || [ ! -f "$profiles" ]; then
  echo "  ~ signing profile: skipped: no profiles.xml under $TIZEN_HOME-data"
elif ! command -v openssl >/dev/null 2>&1; then
  echo "  ~ signing profile: skipped: openssl not found (cannot inspect the cert)"
else
  # The <profile name="X"> block's first key is the author .p12.
  p12=$(sed -n "/name=\"$PROFILE\"/,/<\/profile>/p" "$profiles" \
    | sed -n 's/.*key="\([^"]*\.p12\)".*/\1/p' | head -1)
  pass=$(sed -n "/name=\"$PROFILE\"/,/<\/profile>/p" "$profiles" \
    | sed -n 's/.*password="\([^"]*\)".*/\1/p' | head -1)
  if [ -z "$p12" ] || [ ! -f "$p12" ]; then
    echo "  ~ signing profile: skipped: author cert for '$PROFILE' not found"
  else
    issuer=$(openssl pkcs12 -in "$p12" -passin "pass:$pass" -nokeys -clcerts 2>/dev/null \
      | openssl x509 -noout -issuer 2>/dev/null || true)
    if [ -z "$issuer" ]; then
      echo "  ~ signing profile: skipped: could not read '$PROFILE' cert (wrong password?)"
    elif printf '%s' "$issuer" | grep -qi samsung; then
      echo "  ✓ signing profile: '$PROFILE' is a Samsung cert"
    else
      echo "  ⚠ signing profile: '$PROFILE' is not Samsung-issued (self-signed?), installs on the emulator only, not a retail TV"
    fi
  fi
fi

# --- Secondary: an app with this id already installed under a different author ----
# A retail set rejects an update signed by a different author than the installed
# copy. Best-effort: retail firmware locks the shell down, so this frequently and
# legitimately degrades to skipped.
if [ -z "$SERIAL" ] || [ -z "$PKG_ID" ]; then
  echo "  ~ installed app: skipped: no TV connected"
else
  info=$("$SDB" -s "$SERIAL" shell 0 pkginfo --pkg "$PKG_ID" 2>/dev/null || true)
  if [ -z "$info" ] || printf '%s' "$info" | grep -qi 'not.*install\|fail\|denied'; then
    echo "  ~ installed app: skipped: '$PKG_ID' not installed or shell locked down"
  else
    echo "  ✓ installed app: '$PKG_ID' present (uninstall first if a cert mismatch is suspected)"
  fi
fi

[ "$blocked" -eq 0 ] || {
  echo "  → stopping before install: this set is below the supported floor."
  exit 1
}
