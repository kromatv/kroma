# Samsung TV install results: what a set answers

What the TV installer relies on when it reads a Samsung set's answer to an
install over sdb (`packages/installer/src/platforms/tizen`). Each fact names
its source and how it is known. Read 2026-11-17.

No Samsung page listing these codes was found. Everything here was seen on
hardware or in another installer's published notes.

## Sources

- **H1**: [#86](https://github.com/kromatv/kroma/issues/86), a 2017 "Series 6"
  set on Tizen 3.0, sent a `.wgt` whose `config.xml` said
  `required_version="6.0"`, signed with a valid Samsung certificate for that
  set.
- **H2**: a "Samsung 6 Series (55)" reached by `@kromatv/installer` on
  2026-11-17, sent `KROMA-tizen-0.1.38.wgt`, whose `config.xml` says
  `required_version="6.0"`.
- **H3**: the GQ75LS03DAUXZG, Tizen 9.0, through this installer.
- **J**: [Georift/install-jellyfin-tizen](https://github.com/Georift/install-jellyfin-tizen)
  README, "Common errors".

## The shape of an answer

- A refused `vd_appinstall` ends with `app_id[<package>] install
  failed[<code>]`, then `spend time for wascmd is [<ms>]ms`, then `cmd_ret:0`
  (H2).
- `cmd_ret:0` comes after a failure too, so it says nothing about the install
  (H2).
- Lines end with CRLF: inferred from how the terminal drew the quoted answer
  in H2, each line overwriting the start of the one before it.

## The codes

| Answer | Meaning | Source |
| --- | --- | --- |
| `install failed[118]`, nothing after the code | The package asks for a newer Tizen than the set runs: `required_version` in `config.xml` | H1, H2 |
| `install failed[118, -11], reason: Author certificate not match` | A copy of the package signed by another author is on the set | H3, J |
| `install failed[118, -12], reason: Check certificate error : :Invalid certificate chain with certificate in signature.` | The distributor certificate is not one Samsung issued for this set | H3, J |

- A native `.tpk` carries its floor as `api-version` on `<manifest>`. The
  installer reads it the same way as `required_version`. No set below it has
  been sent one, so the answer to that case is not known.

## Not known

- Whether every bare `install failed[118]` is a version floor. H1 and H2 are
  the only cases seen, and both are.
