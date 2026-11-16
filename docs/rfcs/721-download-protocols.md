# RFC 721: a release says how it downloads, and any protocol plugs in

- Status: **DRAFT**
- PR: #721 (the issue)
- Affects: `docs/spec/modules/acquisition.md` (MOD-95 to MOD-102, which qualify MOD-64,
  MOD-72, MOD-77 and MOD-78), `docs/spec/modules/README.md` (MOD-47), the core `downloads`
  ledger, the modules
  `tv.kroma.torznab`, `tv.kroma.indexer`, `tv.kroma.scene`, `tv.kroma.acquisition`,
  `tv.kroma.torrents`, and two new ones, `tv.kroma.engine.sabnzbd` and
  `tv.kroma.engine.nzbget`

## Summary

A release carries the name of the protocol that downloads it, `torrent` or `usenet`. An
indexer engine sets it, a download client declares which ones it takes, and a grab goes to
the best client that takes the release's. Everything between the two ends carries the name
without reading it. Usenet is the first protocol added this way. The next one is an indexer
engine and a download client, and nothing else changes.

## Motivation

Someone who gets their releases from Usenet cannot use acquisition at all (#721). Pointing
the Torznab engine at a Newznab indexer gets surprisingly far, because the two speak the same
API, and then fails in five places:

- every Usenet release is refused, because a release that reports no seeders is read as
  having none, and the default profile wants two;
- nothing records that a link is an NZB, so the grab goes to whichever download client ranks
  first, rqbit included;
- a download client can only be Transmission or qBittorrent, and its credentials can only be a
  user and a password, where SABnzbd wants an API key;
- a client that reports 100% is imported at once, while a Usenet client still has the repair
  and the unpacking ahead of it;
- a download the client gave up on reads as a transient error, and sits for `acqStallHours`
  before anything searches again.

Each is a place where the code assumed BitTorrent. Fixing them for Usenet alone would leave
the same five assumptions waiting for the next protocol.

## Proposal

### The rule

**A protocol is a name, and only a module that implements one reads it.** The indexer
engines that find releases and the download clients that fetch them know what a protocol is.
The search point, acquisition, the scene engine and the queue carry the name as an opaque
string: they store it, route by it and show it. They judge a release on the facts it carries,
and a fact a release does not carry is never held against it.

A name is lowercase. A field that is missing means `torrent`, because every release and every
download before this RFC was one.

### What changes on each point

All of it is additive. A peer on an older version keeps working, and reads as `torrent`.

**`tv.kroma.indexer/engine` and `tv.kroma.indexer/search`.** A release gains `protocol`.
The engine that found it sets it. A release that has a swarm always reports `seeders`, 0 when
the tracker does not say; a release that has none leaves `seeders` out.

The Torznab engine reads the protocol off each item: a magnet or an
`application/x-bittorrent` enclosure is `torrent`, an `application/x-nzb` enclosure is
`usenet`, anything else stays `torrent`. One engine serves Jackett, Prowlarr and any Newznab
indexer, and also reads Newznab's `grabs` and `imdb` attributes.

**`tv.kroma.torrents/grab`.** The grab spec gains `protocol`, and the ledger row records it.

**`tv.kroma.torrents/client`.** Four additions:

| Addition | Shape | When it is missing |
|---|---|---|
| A `caps` method | `{ "protocols": ["usenet"] }` | `["torrent"]` |
| `args.protocol` and `args.name` on `add` | the release's protocol and title | `torrent`, and the client names the job |
| `client.settings` on every call | the add-form fields that are not `url`, `username` or `password`, by key | `{}` |
| Two `state` values on `status` | `processing`, `failed` | an unknown state reads as `error` |

`processing` means the transfer is over and the client is still working on it: verifying,
repairing, unpacking or moving. Nothing is imported until the state leaves it. `failed`
means the client gave up and will not retry. The ledger marks the download failed, and
acquisition blocklists the release and searches again on its next pass instead of waiting
for the stall timer. `error` keeps its meaning: something went wrong that may recover.

A torrent at full progress counts as finished whatever state it reports, as it always has.
A download of any other protocol is finished only when its client reports `completed`.

`status` answers `null` only when the client no longer knows the job, and the queue fails
the download. An engine that cannot reach its daemon answers with an HTTP error instead,
which the queue reads as a missed poll and retries.

### Facts, not protocols

- **Minimum seeders** applies to a release that reports seeders. A Usenet release reports
  none, so the rule does not apply to it. A torrent release always reports them, so nothing
  changes for one.
- **Ranking** compares seeders only between two releases that both report them.
- **A download client** gets a grab when its `caps` list the release's protocol. The highest
  priority enabled one wins, as today. A grab with no client for its protocol fails and says
  which protocol is missing.
- **Torrent-only features** (file selection, reannounce, reseeding, peers and ratio) live in
  the torrents module, which implements BitTorrent, and show for a torrent download only.

### Two new modules

`tv.kroma.engine.sabnzbd` drives SABnzbd's API with a URL and an API key.
`tv.kroma.engine.nzbget` drives NZBGet's JSON-RPC with a URL, a user and a password. Both
answer `tv.kroma.torrents/client` with `caps` of `["usenet"]`, report the repair and the
unpacking as `processing`, and a job the client failed as `failed`. Both leave repair and
unpacking to the client, so the importer finds plain video files, as it does for a torrent.

### What the operator sees

- The downloads module's display name becomes "Downloads". Its id stays `tv.kroma.torrents`.
- A release and a download show their protocol.
- Seeders, peers and ratio show where they mean something and nowhere else.
- The add-client form offers every installed engine and stores every field it declares. A
  secret field is write-only, the way a password already is.

### Adding the next protocol

1. An indexer engine that tags its releases with the new name.
2. A download client whose `caps` list it.
3. A label for the name in the locales that display it, falling back to the raw name.

## What this costs

- The `downloads` ledger gains a column, `protocol`, defaulting to `torrent`.
- `download_clients` gains a column, `settings`, a JSON object.
- Six modules change and two are new, each released on its own tag.
- The point is still named `tv.kroma.torrents/client`, and the module that defines it is
  still `tv.kroma.torrents`. The name is wrong now. Renaming a published module id is a
  migration for every installed server, and the display name is what the operator reads.

## Compatibility

- **Existing downloads and releases** read as `torrent`, which they are.
- **qBittorrent and Transmission engines on an older version** answer no `caps`, which reads
  as `["torrent"]`.
- **An older acquisition** sends no `protocol`, which reads as `torrent`.
- **An older torrents module** ignores `protocol` and would hand a Usenet grab to its first
  client. Acquisition and both Usenet engines require the torrents version that routes by
  protocol, so that pair cannot be installed together.

## Alternatives

- **Declare the protocols in the manifest**, on the contribution. The operator would see them
  in the Store, but the core would have to parse and forward a field that only the
  downloads module reads, and no crate under `server/` names a module's domain.
- **Branch on `protocol == "torrent"`** in the scene engine and acquisition. Simpler today,
  and the same five assumptions moved into `if` statements for the next protocol to trip on.
- **A Usenet module beside the torrents module**, with its own queue. Two ledgers, two
  monitors, two import triggers, and acquisition picking between them.
- **Download Usenet in KROMA**, without SABnzbd or NZBGet. NNTP, yEnc, par2 repair and unrar
  inside a component is a large native surface, and the people asking already run a client.
- **Do nothing.** Usenet users run Sonarr and Radarr instead, and KROMA's acquisition stays
  for torrent users only.

## Settled in review

- **A preferred protocol.** A profile can name one, and it wins a tie on quality, format score
  and revision, where Sonarr places it. Waiting for a preferred protocol, the other half of
  Sonarr's delay profiles, stays out of scope with every other wait before a grab.
- **The VPN kill switch** holds torrent grabs only: it exists for the swarm, which only
  BitTorrent joins. The grab point gains `held`, the protocols held right now, and `gate-open`
  answers whether any grab can still go out. An automatic search asks once per pass and skips
  the releases of a held protocol, so a Usenet release still goes through.
- **Manual add** asks which protocol a pasted link is, from the protocols the enabled clients
  take, and only offers file selection for a torrent.

## Unresolved

Nothing at the time of writing.
