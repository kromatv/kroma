# VPN provider facts behind the VPN module

What `tv.kroma.vpn` relies on when it connects to Mullvad by itself and when it
reads a Proton VPN file. Each fact names its source and how it is known. Read
2026-11-09.

## Mullvad: one device, any relay

Sources: the accounts API spec at
<https://api.mullvad.net/accounts/v1/> (rendered from
`static/openapi/accounts-v1.79f230f44dff.yaml`), the
[mullvadvpn-app](https://github.com/mullvad/mullvadvpn-app) sources at
`b8e8e546`, and [mullvad-wg.sh](https://github.com/mullvad/mullvad-wg.sh) at
`ce91d41a`. Documented, and read in Mullvad's own client.

- An account number buys a token: `POST https://api.mullvad.net/auth/v1/token`
  with `{"account_number"}` answers `{access_token, expiry}`
  (`mullvad-api/src/access.rs`). Later calls send `Authorization: Bearer`.
- `POST /accounts/v1/devices` with `{"pubkey", "hijack_dns": false}` registers a
  key and answers 201 with `id`, `name`, `pubkey`, `ipv4_address` and
  `ipv6_address` (spec, `mullvad-api/src/device.rs`). The address may come with
  or without a prefix; the module writes `/32` when it has none.
- An account holds a few devices (`max_devices`, 5 in the spec's example and in
  the [FAQ](https://mullvad.net/en/help/faq)). Past it, device creation answers
  400 `{"code":"MAX_DEVICES_REACHED"}`. Other 400 codes: `INVALID_ACCOUNT`,
  `PUBKEY_IN_USE`, `INVALID_INPUT`. Throttling is 429 `{"code":"THROTTLED"}`,
  with no published limit.
- `GET /accounts/v1/devices` lists the devices; `DELETE
  /accounts/v1/devices/{id}` removes one (204). `PUT
  /accounts/v1/devices/{id}/pubkey` rotates a key and, per the spec, changes the
  device's addresses too.
- One device and key serve every relay: mullvad-wg.sh registers once and writes
  the same `PrivateKey` and `Address` into a config per relay (lines 53 to 81).
  So the module changes country by changing only the `[Peer]`, without calling
  the accounts API.
- A new key can take up to 60 seconds to reach the relays (`mullvad-wg.sh:90`).

### The relay list

- `GET https://api.mullvad.net/public/relays/wireguard/v2` needs no account.
  Verified by fetching it: 557 relays in 50 countries on the day it was read.
- Shape: `locations` maps a code such as `se-sto` to `{country, city}`;
  `wireguard` holds `ipv4_gateway`, `port_ranges` and `relays`. Each relay has
  `hostname`, `location`, `active`, `owned`, `provider`, `ipv4_addr_in`,
  `ipv6_addr_in`, `public_key`, `weight` and `include_in_country`.
- A relay with `include_in_country: false` is chosen only by naming its city,
  never for a whole country
  (`mullvad-relay-selector/src/relay_selector/filter.rs`). The module does the
  same.
- `owned: true` marks a server Mullvad owns rather than rents; the module offers
  to keep to those.
- Mullvad's own app now reads a signed list instead (`trl/v1/...`, Sigsum). The
  public v2 list is not signed. Inferred risk: a wrong list could point the
  tunnel at a relay whose key is not Mullvad's; the TLS connection to
  `api.mullvad.net` is what the module relies on.

### The config

- DNS inside the tunnel is the list's `ipv4_gateway`, `10.64.0.1`
  (`mullvad-wg.sh:62`, the [router guide](https://mullvad.net/en/help/running-wireguard-router)).
- `AllowedIPs = 0.0.0.0/0, ::/0` (`mullvad-wg.sh:79`). The module keeps IPv4
  only, as it does for every provider.
- Endpoint port: mullvad-wg.sh uses `51820`, inside the list's `port_ranges`.

### What Mullvad does not offer

- Port forwarding ended on 2023-07-01
  ([announcement](https://mullvad.net/en/blog/removing-the-support-for-forwarded-ports)).
  Inferred: a torrent client behind Mullvad takes no inbound connection.
- No policy page on P2P was found. Not verified either way.
- `https://am.i.mullvad.net/json` answers `mullvad_exit_ip` (bool) among other
  fields, from inside the tunnel. Not used by the module yet.

## Proton VPN: the file is the interface

Sources: [WireGuard configurations](https://protonvpn.com/support/wireguard-configurations),
[port forwarding](https://protonvpn.com/support/port-forwarding-manual-setup),
[P2P](https://protonvpn.com/support/bittorrent-vpn), and Proton's
[python-proton-vpn-api-core](https://github.com/ProtonVPN/python-proton-vpn-api-core).
Documented.

- Proton offers no unauthenticated server list: `api.protonvpn.ch/vpn/logicals`
  answers 401 without a signed-in session. Its terms allow automated access only
  when "indistinguishable from the standard client behavior of human users". So
  the module takes the file Proton's generator hands out rather than making one.
- The generator lives at Downloads → WireGuard configuration on
  <https://account.protonvpn.com/downloads>: a name, a platform (Router among
  them), NetShield, Moderate NAT, NAT-PMP (port forwarding), VPN Accelerator,
  then a server.
- A downloaded file carries comments the module reads: `# Key for <name>` and
  the options under `[Interface]` (`# NAT-PMP (Port Forwarding) = on`), and the
  server under `[Peer]`, such as `# CH#3`. Seen in the support page's example.
- P2P is allowed on dedicated servers only, on paid plans, marked with a double
  arrow; every P2P server supports port forwarding. A file does not say whether
  its server allows P2P, so the module tells the admin which server to pick.
- Port forwarding over NAT-PMP is asked of `10.2.0.1` every 45 seconds, each
  mapping lasting 60. Not done by the module yet.
- Every Proton file uses `10.2.0.2` by default, so two Proton tunnels on one
  host would collide unless renumbered.

## Several tunnels at once

What the module relies on when a kept config runs a tunnel of its own beside
the default one, so a network rule can name it. Read 2026-11-09.

- **One key, one tunnel.** WireGuard "discovers the endpoint of its peers by
  examining from where correctly authenticated data originates", and "both
  client and server send encrypted data to the most recent IP endpoint for which
  they authentically decrypted data" (<https://www.wireguard.com/>, Built-in
  Roaming). Documented. Inferred from it: two bridges on one private key look
  like one peer hopping between ports, and each steals the other's replies. So
  a config that is also the default never runs a second bridge: its own network
  name points at the default tunnel.
- **Proton allows it.** "If your WireGuard client or router supports the
  feature, you can deploy multiple WireGuard VPN tunnels simultaneously"
  ([WireGuard configurations](https://protonvpn.com/support/wireguard-configurations)).
  Documented. The page renumbers the second file's `Address` to `10.3.0.2/32`
  for clients that share one network stack; wireproxy does not (below).
- **How many.** [Pricing](https://protonvpn.com/pricing): Free secures 1 device
  at a time, VPN Plus 10. For manual OpenVPN, an auth failure can mean "You
  have hit your maximum number of concurrent sessions", "Free users get 1
  connection, while Proton Plus users get up to ten connections"
  ([auth fail](https://protonvpn.com/support/vpn-auth-fail-solution)).
  Documented. No page says the same of a WireGuard file. Read in source: the
  VPN server, not the app, counts sessions per account. Proton's local agent
  names `REASON_CODE_MAX_SESSIONS_FREE` to `_PLUS`
  ([local-agent-rs](https://github.com/ProtonVPN/local-agent-rs/blob/74ec6f4f/local_agent_rs/src/reason_code.rs#L14-L20)),
  and a session past the limit is jailed, "vpn tunnel established, but not
  communicating to the rest of internet"
  (`python-proton-vpn-local-agent/src/agent_features.rs:45-46`). Inferred: each
  tunnel the module runs is one session, the default included, and one past
  the limit opens but passes nothing, with no error wireproxy could see. The
  page says so beside the router list. The same file names
  `REASON_CODE_KEY_USED_MULTIPLE_TIMES` (line 20), so one file never runs twice.
- **No address clash.** wireproxy v1.1.2 (commit `3792cd42`) takes one
  `WGConfig` per process (`config.go:76-80`, `config.go:540-546`) and puts its
  `Address` on an in-process gVisor stack (`wireguard.go:70`, wireguard-go
  `tun/netstack/tun.go:62`). Read in source. Inferred: two bridges that both use
  `10.2.0.2/32` each own a private copy, so Proton files need no renumbering
  here.
- **Mullvad: one key, several relays.** Mullvad's own client runs one key on
  two relays at once for multihop: two devices built from the same
  `config.tunnel.private_key`
  ([mullvadvpn-app](https://github.com/mullvad/mullvadvpn-app/blob/b8e8e546/talpid-wireguard/src/gotatun/mod.rs#L200-L209)),
  and `mullvad-wg.sh` writes one config per relay with the same `PrivateKey`
  and `Address`, then prints `wg-quick up` for each (lines 65 to 88). Read in
  source. Mullvad's warning is about devices, not relays: "If you are running
  WireGuard on multiple devices, generate a separate key for each device"
  ([Linux guide](https://mullvad.net/en/help/easy-wireguard-mullvad-setup-linux)).
  So a place in the router reuses this server's device, and never a relay the
  default or another kept place already reaches.
- **Mullvad counts devices.** "An account can be used on up to 5 devices"
  ([terms](https://mullvad.net/en/help/terms-service)); the accounts spec's
  `max_devices` is the "Maximum number of devices allowed for this account"
  and has no field that counts connections. Documented. Inferred: a place in
  the router takes no device slot.
