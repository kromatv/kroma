# Network modules: networks and middleware

A module can take part in KROMA's networking in two ways: it can **provide a
network** that rules route traffic through, or it can sit in the decision path as
**middleware** that inspects, blocks or re-routes connections. Both are ordinary
modules reached over points, like everything else (see
[modules/README.md](../modules/README.md#calling-another-module)). How routing
works is in [networking](networking.md).

`network` is on `main` (#491). `network-policy` is planned (#493), and this
page is the contract it is being built to.

## Providing a network

A network is a way out with a name: a WireGuard tunnel, Tor, a SOCKS proxy at the
office, a second VPN in another country. The module that runs it answers the
core-called point `network`:

```json
"contributes": [{ "point": "network" }],
"permissions": { "net": { "host": true }, "run": ["wireproxy"] }
```

A component cannot listen on a socket, so the tunnel is a program the module
starts: named in `run`, pinned under `helpers`, and started by the host. Only a
first-party module may start one. `net.host` says that program reaches the
internet from the host. It is the permission the install screen shows in red, so
a network module should do nothing else.

### `network/list`

The core asks every provider what it offers, at most every 5 seconds.

```json
[
  {
    "name": "vpn-ch",
    "label": "WireGuard, Zurich",
    "endpoint": { "address": "127.0.0.1:25345", "username": "kroma", "password": "..." },
    "carries": { "tcp": true, "udp": false, "dns": true },
    "health": { "up": true, "exit": "185.x.x.x" }
  }
]
```

- `name` is what rules refer to. It is unique across providers; a clash is
  reported and the second one is ignored.
- `endpoint` is a SOCKS5 server the gateway dials. It must require credentials,
  because the gateway is its only client and other processes share loopback.
- `carries.dns` means the network resolves names itself when handed one, which is
  what keeps DNS inside the tunnel.
- `health.up: false` makes every connection routed to the network fail at once.
  Nothing falls back to direct. A provider that is enabled and does not answer
  counts the same for a module that must never go direct: it is told the seal is
  broken, never that there is no network.

### Chaining

A network can leave through another one. A Tor module whose entry connections
should go through the VPN does not need anything special: the operator writes a
rule for the Tor module's own traffic (`caller: "tv.kroma.tor"`, `action:
"vpn-ch"`), and the gateway applies it like any other.

## Network middleware

Middleware sees every decision before it is applied. It is how a module adds
behaviour the core does not have: a tracker blocklist, routing by the
destination's country, an alert on a new destination.

```json
"contributes": [{ "point": "network-policy" }]
```

A middleware needs no network permission of its own to decide. If it calls
something, it declares it like any other module.

### `network-policy/decide`

Called for each connection, after the guards and the operator's rules, in the
order the operator set in Admin → Réseau.

```json
{
  "caller": "tv.kroma.indexer",
  "purpose": "indexer",
  "host": "tracker.example.org",
  "port": 443,
  "decision": { "action": "vpn-ch", "rule": "indexers" }
}
```

`decision.action` is the route the guards and rules chose, spelled as a rule's
action: `direct`, a network's name, or `block`. The middleware answers one of:

```json
{ "verdict": "keep" }
{ "verdict": "block", "reason": "on the blocklist" }
{ "verdict": "network", "network": "vpn-se", "reason": "Swedish exit for Swedish trackers" }
```

The rules a middleware lives by:

- **It can only make a decision stricter or move it to another network.** It can
  turn an allowed connection into a blocked one, or send it through a different
  network. It cannot unblock what a guard or a rule blocked, and it cannot send a
  connection direct that a rule sent through a network.
- **It is on the hot path**, so it has 200 ms. A middleware that does not answer
  in time is skipped and the skip is recorded. A middleware the operator marked as
  required blocks the connection instead, which is what a blocklist should do.
- **It sees caller, purpose, host and port**, plus the decision it may tighten.
  Never a URL path, a query string, a credential or the account behind the call.
- **Its answers are cached** for the same caller, purpose, host and port for a few
  seconds, so a burst of connections is one question.

### `network-policy/observe`

Optional. A middleware that answers it receives the journal's rows in batches
once connections close, to build its own statistics or alerts. It cannot change
anything from there.

## Checklist for a network or middleware module

- Declare exactly the points you answer and consume, and the permissions you
  need. Nothing undeclared works, on purpose.
- Never log or forward a URL path, a query string or a credential you were given.
- Fail closed: a network you cannot keep up says `up: false`, a check you cannot
  make answers `block` if you are required.
- Once `kroma audit` ships (#495), run it on your module before you publish it,
  and read what it says you attempted.
