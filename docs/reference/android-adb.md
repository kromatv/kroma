# Android TV over adb: what the installer speaks

What the TV installer relies on when it installs KROMA on an Android TV with no
adb binary on the computer (`packages/tv-installer/src/modules/androidtv/adb`).
Each fact names its source. Read 2026-11-10.

## Sources

- **A1**: AOSP `platform/packages/modules/adb` at `1cf2f017d312`, Apache-2.0:
  `docs/dev/protocol.md`, `docs/dev/sync.md`, `docs/dev/services.md`,
  `adb.h`, `adb.cpp`, `adb_auth.h`, `file_sync_protocol.h`,
  `client/auth.cpp`, `client/adb_install.cpp`, `crypto/rsa_2048_key.cpp`.
- **A2**: AOSP `platform/system/core` at `a3b721a32242`, Apache-2.0:
  `libcrypto_utils/android_pubkey.cpp` and
  `libcrypto_utils/include/crypto_utils/android_pubkey.h`.
- **E**: checked against an Android TV emulator (`sdk_google_atv64_arm64`,
  Android 16) on 2026-11-10, read-only: handshake with a key the emulator
  trusts, `shell:getprop`, a 1 MiB round trip through `exec:cat`, and a pushed
  file whose MD5 matched, then removed. Nothing was installed.
- **K**: the public key this code builds for `~/.android/adbkey` is byte for
  byte the one Google's adb wrote to `~/.android/adbkey.pub` for it.

## Messages

- A message is a 24-byte header of six little-endian 32-bit words, `command`,
  `arg0`, `arg1`, `data_length`, `data_crc32`, `magic`, then the payload.
  `magic` is `command ^ 0xffffffff` (A1 `protocol.md`).
- Commands: `CNXN` `0x4e584e43`, `AUTH` `0x48545541`, `OPEN` `0x4e45504f`,
  `OKAY` `0x59414b4f`, `CLSE` `0x45534c43`, `WRTE` `0x45545257`, `STLS`
  `0x534c5453` (A1 `protocol.md`).
- `data_crc32` is the plain sum of the payload bytes, not a CRC (A1 `adb.cpp`
  `calculate_apacket_checksum`). A peer at version `0x01000001` or later
  ignores it (A1 `adb.h` `A_VERSION_SKIP_CHECKSUM`); the installer sends it
  anyway, for older TVs.
- The host sends `CNXN(0x01000001, maxdata, "host::")` first. `CNXN` and `AUTH`
  stay under 4096 bytes, because a TV states its own `maxdata` only in its
  answer (A1 `protocol.md`, `adb.cpp` `send_connect`).
- The TV's `CNXN` payload is `device::` followed by `key=value` pairs separated
  by `;`, among them `ro.product.model` and `features=` a comma list (A1
  `adb.cpp` `get_connection_string`).

## Authentication

- The TV answers `AUTH(1, 0, token)`, a 20-byte token (A1 `adb_auth.h`
  `ADB_AUTH_TOKEN`, `adb.h` `TOKEN_SIZE`).
- The host signs it with `RSA_sign(NID_sha1, token)`: PKCS#1 v1.5 over the
  SHA-1 DigestInfo with the token in place of the digest, and sends
  `AUTH(2, 0, signature)`. A TV that trusts none of the keys tried sends a new
  token (A1 `client/auth.cpp` `adb_auth_sign`, `protocol.md`).
- Out of keys, the host sends `AUTH(3, 0, public key + "\0")`. The TV shows the
  "allow USB debugging" prompt, and answers `CNXN` once the owner accepts (A1
  `client/auth.cpp` `send_auth_publickey`, `protocol.md`).
- The public key is base64 of Android's `RSAPublicKey` struct, then a space and
  a name: `modulus_size_words` (64), `n0inv` (`-1 / n[0] mod 2^32`), the
  256-byte modulus little-endian, `rr` (`2^4096 mod n`) little-endian, and the
  exponent. The key is RSA-2048 with exponent 65537 (A2, A1
  `crypto/rsa_2048_key.cpp`, K).
- Google's adb keeps its key in `~/.android/adbkey`, PEM (A1 `client/auth.cpp`).
- A TV that answers `STLS` wants TLS, which is Wireless debugging with a pairing
  code (A1 `protocol.md`). The installer does not speak it.

## Streams

- `OPEN(local, 0, "service\0")` opens a service; the TV answers
  `OKAY(remote, local)`, or `CLSE` when it refuses (A1 `protocol.md`).
- After a `WRTE`, the next waits for an `OKAY`. Each `WRTE` the TV sends is
  answered with `OKAY` (A1 `protocol.md`).
- `shell:command` runs a command and returns its output; `exec:command` runs it
  with nothing between the bytes and the command (A1 `services.md`).

## Installing

- A TV whose features list `cmd` takes a streamed install:
  `exec:cmd package 'install' '-r' -S <size>`, then the APK's bytes; the TV
  prints `Success` or `Failure [...]` and closes (A1 `client/adb_install.cpp`
  `install_app_streamed`, `escape_arg`).
- An older one takes the file first through `sync:`: `SEND` with
  `path,mode`, `DATA` chunks of at most 64 KiB, `DONE` with the mtime, then
  `OKAY` or `FAIL` with a reason; `QUIT` leaves sync mode. Then
  `pm install -r <path>` (A1 `docs/dev/sync.md`, `file_sync_protocol.h`,
  `client/adb_install.cpp` `install_app_legacy`).
- The installer launches KROMA with
  `monkey -p <id> -c android.intent.category.LEANBACK_LAUNCHER 1`, as it did
  with the adb binary.

## Not known

- Whether every Android TV in network debugging accepts a second connection
  while another computer holds one. The emulator did (E).
- The streamed install has not run against a real TV from this code: E ran the
  same stream mechanics with `exec:cat`, not `cmd package install`.
