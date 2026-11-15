# Android TV over adb: what the installer speaks

What the TV installer relies on when it installs KROMA on an Android TV with no
adb binary on the computer (`packages/installer/src/platforms/androidtv/adb`).
Each fact names its source. Read 2026-11-10, Wireless debugging and pairing
read 2026-11-15.

## Sources

- **A1**: AOSP `platform/packages/modules/adb` at `1cf2f017d312`, Apache-2.0:
  `docs/dev/protocol.md`, `docs/dev/sync.md`, `docs/dev/services.md`,
  `adb.h`, `adb.cpp`, `adb_auth.h`, `file_sync_protocol.h`,
  `client/auth.cpp`, `client/adb_install.cpp`, `crypto/rsa_2048_key.cpp`.
  For Wireless debugging: `docs/dev/adb_wifi.md`, `transport.cpp`,
  `daemon/auth.cpp`, `tls/tls_connection.cpp`, `crypto/x509_generator.cpp`,
  `client/adb_wifi.cpp`, `pairing_connection/pairing_connection.cpp`,
  `pairing_connection/include/adb/pairing/pairing_connection.h`,
  `pairing_auth/pairing_auth.cpp`, `pairing_auth/aes_128_gcm.cpp`,
  `proto/pairing.proto`.
- **A2**: AOSP `platform/system/core` at `a3b721a32242`, Apache-2.0:
  `libcrypto_utils/android_pubkey.cpp` and
  `libcrypto_utils/include/crypto_utils/android_pubkey.h`.
- **E**: checked against an Android TV emulator (`sdk_google_atv64_arm64`,
  Android 16) on 2026-11-10, read-only: handshake with a key the emulator
  trusts, `shell:getprop`, a 1 MiB round trip through `exec:cat`, and a pushed
  file whose MD5 matched, then removed. Nothing was installed.
- **K**: the public key this code builds for `~/.android/adbkey` is byte for
  byte the one Google's adb wrote to `~/.android/adbkey.pub` for it.
- **B**: BoringSSL at `8f2554dc344d`: `crypto/curve25519/spake25519.cc`,
  `crypto/curve25519/internal.h`, `include/openssl/curve25519.h`.
- **F**: AOSP `platform/frameworks/base` at `1cdfff555f4a`:
  `core/java/android/content/pm/PackageManager.java`.
- **P**: checked against an Android 14 phone emulator (`sdk_gphone64_arm64`,
  `ro.adb.secure=0`) on 2026-11-15, from Node 26 and from Bun 1.4: four
  pairings with the code its Settings showed, each then listed under Paired
  devices and forgotten after; a wrong code; `getprop` and a 1 MiB round trip
  over TLS. Reached through `adb forward`, so its mDNS was not.
- **H**: checked against a Chromecast HD with Google TV, Android 14, in
  Wireless debugging on a home Wi-Fi, on 2026-11-15: its mDNS answers; a TLS
  connection with a key it was never paired with; then a pairing with the code
  on its screen, `getprop` over TLS with the paired key, and a streamed
  install of a 0.1.38 `.apk`, which its package manager took whole and refused
  with `INSTALL_FAILED_VERSION_DOWNGRADE` because a newer KROMA was on it.

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
- A TV that answers `STLS` wants TLS, which is Wireless debugging (A1
  `protocol.md`).

## Wireless debugging

- With Wireless debugging on, the TV listens on a port picked at random, which
  is not the 5555 of Network debugging, and greets `CNXN` with `STLS` (A1
  `adb_wifi.md`).
- The host answers `STLS(0x01000000, 0)`, then both sides speak TLS on the same
  socket, the host as the client. Every `AUTH` is ignored from then on (A1
  `adb.cpp` `handle_packet`, `adb.h` `A_STLS_VERSION`).
- The TLS is 1.3 and nothing else (A1 `tls_connection.cpp` `DoHandshake`).
- The host's certificate is self-signed over its adb key, SHA-256 with RSA,
  subject `C=US, O=Android, CN=Adb`, valid ten years (A1
  `x509_generator.cpp`). The TV reads only its public key, and lets the host in
  when that key is one in its `adb_keys` (A1 `daemon/auth.cpp`
  `adbd_tls_verify_cert`). The host takes whatever certificate the TV shows (A1
  `transport.cpp` `DoTlsHandshake`).
- The TV allows one handshake a connection, and TLS 1.3 tells the client
  nothing when its certificate is refused: the refusal shows when the host
  reads next (A1 `daemon/auth.cpp` `adbd_auth_tls_handshake`, `transport.cpp`).
  So the installer shows one key per connection, and takes a connection that
  dies between the handshake and `CNXN` as a key the TV does not know. H closed
  the connection that way.
- Once it trusts the key, the TV sends `CNXN` over TLS, and the rest is the
  same protocol (A1 `client/auth.cpp` `adb_auth_tls_handshake`, P).

## Pairing with a code

- A TV is paired with a host when the host's public key is in its `adb_keys`.
  **Pair device with pairing code** starts a pairing server on another random
  port and shows six digits (A1 `adb_wifi.md`).
- The host connects to it over TLS 1.3 with the same self-signed certificate,
  and neither side checks the other's (A1 `pairing_connection.cpp`
  `SetupTlsConnection`).
- Both sides export 64 bytes of keying material from the TLS session, under the
  label `adb-label` followed by a zero byte and no context, and append them to
  the code: that is the password (A1 `pairing_connection.cpp`,
  `tls_connection.cpp` `ExportKeyingMaterial`, where the length is `sizeof` of
  the label).
- They run BoringSSL's SPAKE2 on it, the host as `alice` named
  `adb pair client` and the TV as `bob` named `adb pair server`, each name with
  its zero byte (A1 `pairing_auth.cpp`).
- That SPAKE2 is over Ed25519, with fixed points `M` and `N`. A side draws 64
  random bytes, reduces them mod the group order and multiplies by 8 for its
  private key; hashes the password with SHA-512 and reduces that for the
  password scalar, then adds the order up to three times until its low three
  bits are clear; and sends `private * B + scalar * M` for `alice`, with `N`
  for `bob`. From the other's message it subtracts `scalar * N` (or `M`),
  multiplies by its private key, and the key is the SHA-512 of both names, both
  messages, that point and the password hash, each after its length as eight
  little-endian bytes: 64 bytes (B `spake25519.cc`, `curve25519.h`).
- Every message starts with six bytes: version `1`, a type, `0` for a SPAKE2
  message and `1` for peer information, and the payload's size big-endian (A1
  `pairing_connection.cpp` `PairingPacketHeader`, `pairing.proto`).
- Each side sends its SPAKE2 message and reads the other's. Then each sends
  its peer information sealed with AES-128-GCM, and reads the other's. The key
  is HKDF-SHA256 of the SPAKE2 key with no salt and the info
  `adb pairing_auth aes-128-gcm key`, 16 bytes. The nonce is a counter of the
  messages sealed in that direction, little-endian in 12 bytes, from zero (A1
  `pairing_connection.cpp`, `aes_128_gcm.cpp`).
- Peer information is 8192 bytes: a type, then data padded with zeros. The
  host sends type `0` with its adb public key, the TV type `1` with its name
  (A1 `pairing_connection.h`, `client/adb_wifi.cpp`).
- A wrong code only shows at the end: the sealed message from the TV does not
  open. The TV keeps the same code on screen and takes another try (P).
- Node's `tlsSocket.exportKeyingMaterial` takes a label with a zero byte in
  it, and an empty context exports what no context does in TLS 1.3 (P, from
  Node and from Bun).

## Finding a TV over mDNS

- A TV advertises `_adb-tls-connect._tcp` while Wireless debugging is on,
  `_adb-tls-pairing._tcp` only while a pairing code is on screen, and
  `_adb._tcp` for the port `adb tcpip` opened (A1 `adb_wifi.md`).
- The port of Wireless debugging is in the SRV record of the first, and
  nowhere else on the network (A1 `adb_wifi.md`, H).
- H answered PTR queries for `_adb-tls-connect._tcp.local` irregularly. Asked
  once a second for three seconds, by multicast with the unicast-response bit,
  straight to its address on port 5353, or both, it answered in six windows of
  nine in one run and in twelve of twelve minutes later: within 150 ms or
  only after one or two seconds, to the asking port or to the group, whichever
  way it was asked. The SRV record came in the same answer. So the installer
  asks both ways, once a second, and listens on its own port and on 5353.
- H advertised `_googlecast._tcp` from the same address, and no
  `_androidtvremote2._tcp` (H).
- A phone in Wireless debugging advertises the same adb service as a TV. A
  device says it has the TV interface with the feature
  `android.software.leanback` (F `FEATURE_LEANBACK`), and
  `cmd package has-feature android.software.leanback` printed `true` on E.

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
- The streamed install has not ended in `Success` on a real TV from this code:
  H took the whole package and refused it as a downgrade.
- Whether every Android TV answers a direct mDNS query the way H did.
