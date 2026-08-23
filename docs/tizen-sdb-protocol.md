# Talking to a Samsung television without Tizen Studio

A Samsung set in developer mode listens on tcp/26101 and speaks sdb, which is
adb's wire protocol with a handful of Samsung differences. `sdb install` is a
few hundred bytes of framing over that socket, so `packages/tv-installer` does
not need the 260 MB SDK to sideload a `.wgt`.

Everything below is either **confirmed** (bytes captured, or read out of a
binary's own code) or **unconfirmed** (read out of a string table, or inferred).
The line between the two is the point of this document, so it is marked on every
claim. The captures were taken by pointing the real `sdb` 4.2.36 client at a
listener on 127.0.0.1:26101 that answered as a device, and reading what it sent.

## Framing

**Confirmed.** A packet is a 24-byte header, little-endian throughout, followed
by `data_length` bytes of payload:

| offset | field |
| --- | --- |
| 0 | command |
| 4 | arg0 |
| 8 | arg1 |
| 12 | data_length |
| 16 | data_checksum |
| 20 | magic |

`data_checksum` is the sum of every payload byte modulo 2^32, not a CRC.
`magic` is `command ^ 0xffffffff`. A header failing either check means the
stream is desynced, and every frame after it is noise.

The commands are adb's four-letter codes read little-endian:

| name | value | meaning |
| --- | --- | --- |
| `CNXN` | `0x4e584e43` | handshake |
| `OPEN` | `0x4e45504f` | open a service |
| `OKAY` | `0x59414b4f` | accept, and acknowledge one write |
| `WRTE` | `0x45545257` | stream payload |
| `CLSE` | `0x45534c43` | close a stream |
| `AUTH` | `0x48545541` | adb's RSA challenge |

Every packet after the handshake carries **`arg0` = the sender's stream id and
`arg1` = the receiver's**. Reading a `WRTE` by the wrong one is the mistake that
looks like the device going quiet: it stops being acknowledged and the peer
never writes again.

## Handshake

**Confirmed.** The host opens the socket and sends

```
CNXN arg0=0x00100000 arg1=0x00040000 "host::\0"
```

`arg0` is the protocol version. Samsung's is **`0x00100000`**, not adb's
`0x01000000`. `arg1` is the largest payload the host will accept, 256 KiB.

The device answers with its own `CNXN`, whose `arg1` caps what the host may put
in one `WRTE`, and whose payload is a banner beginning `device::`. A bare
`device::\0` is enough for `sdb devices` to list the set as online, so nothing
in the banner is load-bearing for the client. The name in the third column comes
from somewhere else: feeding a name through the banner in four shapes never
moved it off `<unknown>`, so read `device_name` out of `capability:` instead.

**Unconfirmed:** that a real television never sends `AUTH`. Tizen gates on the
Host PC list in the Developer Mode panel rather than on an RSA key, and no Tizen
tool here carries key-generation code, but nothing was captured from a set. The
client treats an `AUTH` as a hard error naming the cause.

## Streams

**Confirmed.**

```
host   OPEN  <local> 0        "<service>\0"
device OKAY  <remote> <local>                 accepted
device CLSE  0        <local>                 refused
host   WRTE  <local> <remote> <payload>
device OKAY  <remote> <local>                 one per WRTE, the flow-control gate
device WRTE  <remote> <local> <payload>
host   OKAY  <local> <remote>
either CLSE                                   echoed back by the other side
```

One unacknowledged `WRTE` per stream. Several services may be open at once on
the one socket.

`host:*` services (`host:devices`, `host:connect:…`) belong to the local sdb
**server** on 26099 and do not exist on a device. There is no device-side
listing service: enumerating televisions means connecting to each candidate's
26101 yourself, which is what `devices()` does.

## `capability:`

**Confirmed**, and it is the detail most likely to be got wrong. The payload is
a **uint16 little-endian byte count** followed by that many bytes of
`key:value\n` lines. It is not bare text.

The evidence is `sdb`'s own `is_support_secure_protocol`, which does
`readx(fd, &len, 2)` then `readx(fd, buf, len)` and clamps `len` to `0xfff`.
Behaviour follows: a listener answering with unframed text has its first two
bytes eaten, so the first key silently never matches, while later keys still do.
Adding the prefix flipped `sdb` from `pkgcmd` to `0 appuninstall` on the next
run.

Keys that decide behaviour: `sdk_toolpath` (where to push a package),
`secure_protocol`, `appcmd_support`, `profile_name`, `device_name`,
`platform_version`, `cpu_arch`.

## `sync:`

**Confirmed.** The sync service is adb's, unchanged. Requests are an 8-byte
header, four ASCII letters and a uint32 little-endian, optionally followed by
that many payload bytes.

A push captured off the real client:

```
SEND  len=47  "/home/owner/share/tmp/sdk_tools/Kroma.wgt,33261"
DATA  len=n   <bytes>          repeated
DONE  mtime                    seconds since the epoch, in the length field
OKAY  0                        from the device, or FAIL + len + message
QUIT  0
```

`33261` is `0o100755` in decimal: sdb forces that mode regardless of the local
file's. `sdb` sends a `STAT` for the destination first, to notice a directory;
the client here skips it, and the push works without it.

## Installing a `.wgt`

**Confirmed** as the sequence stock `sdb install` performs:

1. `capability:` for `sdk_toolpath`. When it is missing, `shell:/usr/bin/pkgcmd
   -a | head -1 | awk '{print $5}'`. When that fails too, `sdb` gives up with
   "failed to get package temporary path".
2. `sync:` the file to `<sdk_toolpath>/<basename>`.
3. `capability:` again, plus `shell:/usr/bin/profile_command getversion`.
4. The install command.
5. `shell:0 rmfile "<path>"` when the set advertises the secure protocol, else
   `shell:/bin/rm -f "<path>"`.

This tool's client differs from that sequence twice, and the tests pin both.
It reads `capability:` once per connection and caches it, so there is no step 3,
and it never runs `profile_command`. And it does not read `secure_protocol` to
choose how to delete the pushed file: it tries `0 rmfile` and falls back to
`/bin/rm -f` only when the first reports a failure, which reaches the same end
on a restricted sdbd by a different route.

Which install command is chosen is decided in `sdb`'s `install()`, and reading
the disassembly settles a question the string table only hints at: **stock `sdb`
never uses `0 appinstall` for a `.wgt`.** The `0 appinstall` branch is taken only
when the package type is `tpk` or `rpk` *and* `secure_protocol` is `enabled`.
For a widget it always lands on

```
shell:/usr/bin/pkgcmd -i -t wgt -p "<path>" -q
```

with `-S` added when the skip option is set and `-G` when `-g` is. The
`0 appinstall` format string takes the package **type** first and the path
second, the same order as `pkgcmd`, not a package id:

```
shell:0 appinstall <type> <path>
shell:0 appuninstall <pkgid>
```

**Unconfirmed, and this is the one that matters for a television.** Samsung's TV
extension SDK is not installed on the reference machine, so no capture contains
`vd_appinstall`. Its existence and spelling come from the `tizen-core` binary
(`tools/tizen-core/tz`), which carries `vd_appinstall`, `vd_appuninstall` and
`vd_applist` in its string table and these format strings in
`device.createInstallCommand` / `createUninstallCommand`, resolved from the
disassembly:

```
shell 0 vd_appuninstall %s
shell 0 vd_appuninstall %s.%s
shell 0 appuninstall %s
shell 0 execute %s.%s
shell 0 debug %s.%s
```

The argument order of `vd_appinstall` itself was **not** recovered: `tz` shells
out to `sdb install` for the install path, so no format string for it exists in
any binary here. `0 vd_appinstall <pkgid> <path>` is what the Samsung TV
documentation describes, and it is what the client sends first, but a set has to
confirm it.

The client therefore tries three shapes in order and stops at the first that
reports success:

```
0 vd_appinstall <pkgid> <path>
0 appinstall <type> <path>
/usr/bin/pkgcmd -i -t <type> -p "<path>" -q
```

Uninstall and launch work the same way. Launch leads with `0 was_execute
<appid>`, which is what this repository already sends through `sdb` today and
which appears in no binary here, then `0 execute <appid>`, then
`/usr/bin/app_launcher -s <appid>`.

The `0` prefix is not a shell escape. It is the first argument to sdbd's own
command dispatcher, which is why `0 rmfile` and `/bin/rm -f` are alternatives
for the same job. A restricted sdbd accepts only the dispatcher forms.

## Reading the result

**Confirmed** shapes:

- The sync service says `OKAY` or `FAIL` + length + message.
- `pkgcmd` prints `processing result : OK [0] succeeded` or
  `processing result : FAIL [n] …`, alongside a `spend time for pkgcmd is …`
  line that says nothing about success.
- A refused `OPEN` is a `CLSE` where an `OKAY` was expected.

**Confirmed from the Tizen sdblib jar, not captured:** where the set advertises
`appcmd_support:enabled`, there is a cleaner API that carries an exit code.
`ApplicationCmdService` opens `appcmd:<verb>` and reads `appcmd_exitcode:<n>`
and `appcmd_returnstr:<…>` back:

```
appcmd:install:<type>:<remotePath>
appcmd:uninstall:<pkgid>
appcmd:runapp:<appid>
appcmd:killapp:<appid>
appcmd:packageinfo:<pkgid>
appcmd:appinstallpath:
appcmd:debugwebapp:<appid>
```

The client reads `appcmd_exitcode` when it is present, because it is the only
unambiguous answer, but it does not open `appcmd:` yet: no television here has
confirmed it answers.

**Unconfirmed:** what `0 vd_appinstall` prints. The parser returns one of three
verdicts, `success`, `failure` and **`unknown`**, and `unknown` means "this set
said nothing I recognise", which is a reason to try the next command shape
rather than to declare a failure. Silence from a set that actually installed the
package would otherwise read as a broken install.

## What still needs a television

In rough order of how much a wrong guess costs:

1. **The `vd_appinstall` argument order.** `<pkgid> <path>` versus
   `<type> <path>`. If the first shape is wrong the client falls through to
   `pkgcmd`, so the cost is a confusing log line rather than a failure, but it
   should be settled.
2. **What a successful `0 vd_appinstall` prints**, so `unknown` stops being a
   possible outcome of a good install.
3. **Whether a television's sdbd offers `sync:` at all.** Every capture here is
   against stock sdb's own idea of a device. A restricted TV sdbd could refuse
   it, in which case the fallback is streaming the bytes through a shell service,
   which is not implemented because there is nothing yet to say it is needed.
4. **Whether `AUTH` ever arrives.**
5. **Whether `capability:` is offered.** The client falls back to
   `/home/owner/share/tmp/sdk_tools` when it is not, which is the path every
   capture produced anyway.
6. **`0 was_execute` versus `0 execute`** for launching, and what either prints.

## Signing

A `.wgt` carries two XML digital signatures at its root, and both are present in
what CI ships:

- `author-signature.xml`, `Id="AuthorSignature"`, signed by the author key.
- `signature1.xml`, `Id="DistributorSignature"`, signed by a distributor key,
  and it also references `author-signature.xml`.

`.github/workflows/_release-tv.yml` generates a throwaway author certificate per
run, so the comment there calling it "a throwaway author certificate" is right
about the author half. It is **not** the whole story: `tizen security-profiles
add` fills the distributor slot automatically from the certificate that ships
inside Tizen Studio, which is why the workflow patches the well-known password
`tizenpkcs12passfordsigner` into `profiles.xml`. The `.wgt` KROMA releases is
therefore signed by a self-signed author certificate **and** by Tizen's public
distributor signer.

Producing both files on the reference machine and reading them confirms the
shape:

| | |
| --- | --- |
| canonicalisation | `http://www.w3.org/2001/10/xml-exc-c14n#` |
| signature method | `http://www.w3.org/2001/04/xmldsig-more#rsa-sha512` |
| digest method | `http://www.w3.org/2001/04/xmlenc#sha512` |
| references | one per file in the package, URI-encoded relative paths |
| `#prop` reference | transformed by `http://www.w3.org/2006/12/xml-c14n11` |
| `Object Id="prop"` | `dsp:Profile`, `dsp:Role` (`role-author` or `role-distributor`), `dsp:Identifier` |
| `KeyInfo` | `X509Data` carrying the signer and its CA, base64 wrapped at 76 columns |

`signature1.xml` differs only in its `Id`, its role URI and in listing
`author-signature.xml` as its first reference.

**Does a developer-mode set accept a `.wgt` with no distributor signature, or a
self-signed one?** Unconfirmed, and the release notes claiming a dev-mode TV
accepts what CI signs are describing a package that has a real distributor
signature, so they are not evidence either way. Tizen's signature validator is
specified to require both files and derives the app's privilege level from the
distributor certificate's root, which argues that author-only is refused. That
has to be tested on a set.

There is a third distributor key in play that neither CI nor this document uses:
the Samsung Certificate Extension issues a distributor certificate bound to a
particular set's DUID, and that is what Samsung's own instructions have you sign
with before sideloading. A machine that has ever paired with a real television
through Tizen Studio has one, under `~/SamsungCertificate/<profile>/`. Whether a
developer-mode set insists on it, accepts Tizen's public distributor signer, or
accepts neither is the same open question as above, and one set answers all
three at once.

Writing a signer from scratch is a day's work, not a research project: build the
reference list by walking the package, SHA-512 each file, serialise the two XML
documents, exclusive-c14n the `SignedInfo` element, RSA-SHA512 it. The awkward
part is exclusive canonicalisation, which is fussy about namespace inheritance
and attribute ordering and where a hand-rolled implementation quietly produces a
signature that verifies nowhere.

If it turns out to be needed, the design is a key pair generated on first use
into `~/.kroma` and signed there. Neither a private key nor Samsung's or Tizen's
distributor key belongs in this repository, and copying
`tizen-distributor-signer.p12` out of Tizen Studio would put the SDK back in the
dependency list by the back door.

## Where the code is

`packages/tv-installer/src/modules/tizen/sdb/`, dependency-free apart from `node:net`
and `node:fs`:

| file | what it owns |
| --- | --- |
| `packet.ts` | the header, the checksum, and reassembly out of a byte stream |
| `stream.ts` | one multiplexed service, its flow control and its timeouts |
| `connection.ts` | the socket, the handshake, and the stream table |
| `capability.ts` | the length-prefixed `key:value` payload |
| `sync.ts` | the file push |
| `shell.ts` | one command, bounded output |
| `commands.ts` | every command shape, as pure strings |
| `result.ts` | success, failure or unknown |
| `device.ts` | `connect()`, `devices()`, and the fallback chains |

The tests beside them cover the pure halves, which is everything except the
socket: header round trips, the checksum, reassembly across chunk boundaries,
the capability framing, the sync requests, the command strings and the result
parser. Nothing in the suite needs a television.
