# LG webOS Dev Mode: how the ares tools install an app

What the TV installer relies on when it puts a package on an LG TV in Developer
Mode without LG's CLI (`packages/tv-installer/src/modules/webos/devmode`). Each
fact names the file it comes from and the function or lines. Read 2026-11-10.

Every fact comes from LG's own command-line tools, which LG publishes under
Apache-2.0. None of this has run against a real LG TV yet: the tests run it
against an in-process SSH server that answers what these sources show.

## Sources

- **A**: [webos-tools/cli](https://github.com/webos-tools/cli) at `ed7a6994`,
  version 3.2.6, Apache-2.0. Paths below are relative to its root.
- `package.json` depends on `ssh2` `^1.17.0`, the SSH client the installer
  uses too.

## The defaults of a TV

`files/conf/config.json` and `files/conf-base/profile/config-tv.json`, the
`tv` profile:

- `defaultDeviceInfo`: port `9922`, user `prisoner`, files `stream`, type
  `starfish`.
- `install.tempDirForIpk` is `/media/developer/temp`, with `changeTempDir` and
  `removeIpkAfterInst` both `true`. `lib/install.js` lines 52 to 56 carry the
  same values as its own defaults.

`bin/ares-novacom.js` `getkey` (lines 109 to 150) writes the fetched key into
the device entry with `port: '9922'`, `username: 'prisoner'`, `files: 'sftp'`
and the passphrase the user typed.

## Getting the key

`lib/base/novacom.js`, `Resolver.getSshPrvKey` (lines 343 to 417):

- The key is at `http://<host>:9991/webos_rsa`.
- ares sends a `HEAD` first, then a `GET`. Anything but `200` to either is
  `FAILED_GET_SSHKEY`. The installer sends only the `GET`, and reads at most
  16 KiB of it.
- ares writes the body as it is to `~/.ssh/<device name>_webos` and makes it
  `0600`.

The key is encrypted. ares never decrypts it itself: the passphrase is stored
beside the key (`bin/ares-novacom.js` line 137), and `Session.begin` passes
both to `ssh2`'s `connect` (`lib/base/novacom.js` line 641). The installer
hands the same bytes and the same passphrase to `ssh2`'s own key parser
(`utils.parseKey`), keeps the opened key in
`~/.kroma/keys/webos/<host>.pem` (`0600`, in a `0700` folder), and stores no
passphrase.

## The SSH session

`lib/base/novacom.js`, `Session.begin` (lines 601 to 679):

- `readyTimeout` is `30000`.
- `algorithms.kex` is exactly `diffie-hellman-group1-sha1`,
  `ecdh-sha2-nistp256`, `ecdh-sha2-nistp384`, `ecdh-sha2-nistp521`,
  `diffie-hellman-group-exchange-sha256`, `diffie-hellman-group14-sha1`, in
  that order. Every other algorithm is `ssh2`'s default.
- Host, port, username, private key and passphrase come from the device entry.

`Session.run_ssh` (lines 932 to 1020) runs one command per `exec` channel, with
no pseudo-terminal. A nonzero `exit` code is an error (`makeExecError`, lines
34 to 57). A channel that closes with no `exit` event counts as a success,
for `dropbear` 0.51 and older (lines 1006 to 1013).

## Uploading the package

`lib/install.js`, `install` (lines 41 to 258), in order:

1. `/usr/bin/test -d /media/developer/temp || /bin/mkdir -p /media/developer/temp`
   (line 86). ares appends `&& /bin/chmod 777 <dir>` only for the `root` user.
2. `session.put(<ipk>, /media/developer/temp/<file name of the ipk>)`
   (lines 68 and 96).
3. `/bin/ls -l "<path>"`, logged and nothing else (line 99). The installer
   skips it.
4. An MD5 of the last 200 bytes on both sides, the TV's from
   `/usr/bin/tail -c 200 "<path>" | /usr/bin/md5sum` (lines 105 to 178). The
   installer skips it: it guards the same SSH channel whose own MAC already
   checks every byte.
5. The luna install call, below.
6. `/bin/rm -f "<path>"` (line 247), after a successful install only. The
   installer removes the package whatever the verdict.

The installer also replaces every character outside `[A-Za-z0-9_.-]` in the
file name with `_`, since the path ends up inside a quoted shell argument and
a JSON string.

`Session.put` (lines 727 to 751) tries SFTP first. When SFTP is unavailable
(error code 4 or 127) it falls back to `streamPut`, which runs
`/bin/cat > "<path>"` with the file on standard input (lines 759 to 763).
`sftpPut` (lines 771 to 808) pipes a file read stream into
`sftp.createWriteStream(<path>)`. The installer falls back to `cat` whenever
the SFTP subsystem cannot be opened.

## Asking luna to install

`files/conf/command-service.json`:

- `lunaSend` is `/usr/bin/luna-send-pub`.
- `install` is service `com.webos.appInstallService`, folder `dev`, method
  `install`, answer at `return.details.state`.
- `launch` is service `com.webos.applicationManager`, method `launch`, no
  folder, answer at `return.returnValue`.
- `getSessionList` is service `com.webos.service.sessionmanager`, method
  `getSessionList`, no folder.

`lib/base/luna.js`, `send` (lines 31 to 106):

- The URL is `['luna:/', service, folder, method].join('/')` (line 38). With
  no folder this leaves an empty segment: `luna://com.webos.applicationManager//launch`.
  The installer sends the same string.
- The mode is `-n <count> ` when a reply count is set, `-i ` otherwise
  (lines 42 to 46). A session call adds `-c <sessionId> ` (lines 48 to 50).
- The command is `<lunaSend> <mode><session><url> '<JSON of the parameter>'`
  (line 53).
- Output is read line by line, and lines are joined until they parse as JSON
  (lines 63 to 105). A line that does not parse yet is kept, not reported.
- A reply with `returnValue: false` fails the call with its `errorText`, or
  its `errorMessage` (lines 85 to 89). `sendWithoutErrorHandle` (lines 107 to
  171) passes such a reply on instead.
- In `-i` mode `luna-send` keeps running until its standard input closes,
  which ares only does on a refusal (`lib/util/eof.js`). The installer closes
  the channel once it has a verdict.

`lib/install.js`, `_appinstalld` (lines 204 to 239):

- `options.nReplies = 0` (line 76), so the call runs with `-i`.
- The parameter is `{"id":"com.ares.defaultName","ipkUrl":"<path>","subscribe":true}`
  (lines 67 and 208 to 213).
- A `details.state` matching `/FAILED/i` fails with `details.reason`, or the
  state itself (lines 223 to 228).
- A `details.state` matching `/installed|^SUCCESS/i` is success (lines 229 to
  232).
- Anything else waits for the next reply. A reply with no `details.state` throws
  inside the parser's `try` and is skipped the same way.

## Launching

`lib/launch.js`, `launch` (lines 46 to 251), for an app already installed:

- `makeSession` sets `options.nReplies = 1` (line 570), so every call runs with
  `-n 1`.
- `bin/ares-launch.js` starts from empty parameters (`params = {}`, line 115).
- `lib/session.js` `getSessionList` (lines 18 to 68) calls the session manager
  with `{"subscribe":false}` through `sendWithoutErrorHandle`. When it answers
  `returnValue: true`, the session whose `deviceSetInfo.displayId` is the
  display asked for (0 by default) becomes a session call, `-c <sessionId>`.
  When it answers anything else, the launch goes on with no session.
- `checkDisplayAffinity` (lines 581 to 600) sets `params.displayAffinity = 0`
  when there is no session call.
- `_launch` (lines 182 to 215) sends `{"id":"<app id>","subscribe":false,"params":<params>}`.
  A truthy `returnValue` is success; anything else is `INVALID_OBJECT`.

ares fails a launch when the session manager lists no session or none on the
display asked for (`lib/session.js` lines 38 to 59). The installer launches
with no session call instead, and does the same when the session manager does
not answer at all.

## Not confirmed

- **The key format.** Nothing in A says how the key served on 9991 is
  encrypted. The installer accepts whatever `ssh2`'s parser opens with the
  passphrase, which is what ares relies on too.
- **Whether a TV runs a session manager.** A queries it on every launch, and
  says nothing about which TVs have one.
- **How long a verdict takes.** A waits with no time limit. The installer
  gives the install call five minutes and every other call thirty seconds.
