# Platform facts behind the direct route

What each platform allows when a client reaches its server at
`http://<private IPv4>:<port>`, as [direct-connection.md](../direct-connection.md)
relies on it. Each fact names its source and how it is known. Read 2026-11-08.

## Chrome: Local Network Access

Sources: the [Local Network Access guide](https://developer.chrome.com/docs/modern-web-guidance/guides/security/local-network-access)
and the [launch post](https://developer.chrome.com/blog/local-network-access)
(dated 2025-06-09, updated 2025-09-29). Documented.

- A request from a public page to the local address space needs the
  `local-network` permission; to loopback, the separate `loopback-network` one.
- Once the permission is granted, a request to a private IP literal or a
  `.local` name is exempt from mixed-content blocking. A public hostname that
  resolves to a private address is not, because mixed-content checks run before
  DNS.
- `fetch()` takes `targetAddressSpace: 'local' | 'loopback'`. The guide calls it
  mandatory for LAN targets; the post lists an IP literal as enough on its own.
  KROMA sends it from an https page only, on every request to a private address
  (`withLocalAddressSpace` in `packages/ui/src/lib/lan-reach.ts`): an older
  engine reads the same word as loopback, see [below](#chromium-124-to-138-local-is-loopback).
  It does not apply to WebSocket, where the options object throws.
- Query the state with `navigator.permissions.query({ name: 'local-network' })`:
  `granted`, `prompt` or `denied`. **Never** query `local-network-access`: older
  Chrome crashes the renderer on it and `try`/`catch` cannot stop that. An
  unknown name rejects with `TypeError`.
- The first request to a local address raises the prompt. The guide recommends
  sending it from a user gesture and not on page load while the state is
  `prompt`; it does not say the browser enforces one.
- The permission exists only in secure contexts; an `http://` top-level page is
  denied outright.
- CORS still applies to reading the answer. Private Network Access preflight
  headers are not needed.
- A service worker or shared worker fails unless the permission is already
  granted.
- The prompt launches in Chrome 142 (opt-in flag from 138).
- Neither page mentions Safari or Firefox. KROMA treats a browser without the
  permission as unable to reach the LAN from an https page.

Chromium caps a cached CORS preflight at 7200 s. Inferred from Chromium's
`Access-Control-Max-Age` cap; not re-read for this change.

## Chromium 124 to 138: `'local'` is loopback

Sources: Chromium's source at its release tags,
`third_party/blink/renderer/core/fetch/request.{idl,cc}`,
`third_party/blink/renderer/platform/runtime_enabled_features.json5`,
`services/network/private_network_access_checker.cc` and
`services/network/url_loader.cc`. Read from source 2026-11-13.

- `RequestInit.targetAddressSpace` exists from Chromium 124, where
  `PrivateNetworkAccessPermissionPrompt` turns stable. Chromium 120, the engine
  of webOS 25 and of LG's simulators, has no such member and ignores it.
- Through 138 its values are Private Network Access's: `'local'` is loopback,
  `'private'` the LAN. From 139 `'loopback'` is added, `'local'` means the LAN
  and `'private'` stays as another name for it.
- A request that names a target space is checked against the address it
  connected to, after the connection opens and before the request is written. A
  mismatch fails with `ERR_INCONSISTENT_IP_ADDRESS_SPACE`. The request never
  reaches the server; a CORS preflight before it, which names no target, can.
- Measured on Chrome for Testing 132 (macOS, 2026-11-13), a JSON `POST` to a
  server at a private address: from a `file://` page, `'local'` and `'private'`
  both reject with `TypeError: Failed to fetch`; from an `http://` page on the
  LAN, `'local'` rejects and `'private'` passes. Without the option both pages
  get their answer. No value is safe on these engines, which is why KROMA names
  none off an https page.
- Seen on an LG OLED C5 running webOS 26 (issue #606): the address probe, the
  health poll and the sign-in splash, all sent with a plain `fetch`, reached the
  server; Quick Connect and the nearby beacon, sent through the API client with
  `'local'`, did not. That its engine is in this range is inferred from that,
  not read.

## Apple: App Transport Security and local network privacy

Sources: [`NSAllowsLocalNetworking`](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsallowslocalnetworking),
[`NSAllowsArbitraryLoads`](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsallowsarbitraryloads),
[TN3179](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy),
read through their JSON twins under `/tutorials/data/`. Documented.

- `NSAllowsLocalNetworking` lets ATS connect to unqualified names, `.local`
  names and IPv4 or IPv6 addresses. Since iOS 17, iPadOS 17 and macOS 14, ATS no
  longer allows IP addresses by default.
- On iOS 10+ and macOS 10.12+, `NSAllowsArbitraryLoads` is ignored when
  `NSAllowsLocalNetworking` (or the media or web-content variants) is present.
- Neither key's availability list names tvOS.
- Local network privacy applies to iOS 14+, iPadOS 14+, macOS 15+ and visionOS,
  not tvOS. An outgoing TCP connection to a local address needs the permission,
  whatever the API, URLSession included. Traffic from WKWebView, Safari and
  SFSafariViewController is exempt. The prompt's text is
  `NSLocalNetworkUsageDescription`.

What the shells declare:

| shell | ATS | `NSLocalNetworkUsageDescription` |
| --- | --- | --- |
| mobile (`clients/mobile/app.json`) | `NSAllowsArbitraryLoads` only, so ATS is off | yes |
| tv-native (`clients/tv-native/app.json`) | both keys, so `NSAllowsLocalNetworking` governs: IP literals allowed | yes (tvOS has no such prompt) |
| desktop (`clients/desktop/src-tauri/Info.plist`) | all three keys | yes, added with this change: libmpv plays in the app's own process, which macOS 15 does not exempt the way it exempts the webview |

On iOS the first probe to the LAN raises the local network prompt. Refused, the
probe fails and the phone stays on the public address.

## Android: cleartext traffic

Sources: [`android:usesCleartextTraffic`](https://developer.android.com/guide/topics/manifest/application-element#usesCleartextTraffic)
and the [network security configuration](https://developer.android.com/privacy-and-security/security-config).
Documented.

- An app targeting API 28 or higher defaults to no cleartext.
- The manifest flag is ignored from API 24 when a network security config is
  present, and it is being deprecated: it is ignored for apps targeting API 38+.
  The replacement is `cleartextTrafficPermitted="true"` in the config's
  `base-config`.

Both Expo shells set the manifest flag through `plugins/with-cleartext-traffic.ts`
and ship no network security config, so plain http reaches the LAN today. Moving
to a network security config is due before targeting API 38.

## Samsung Tizen and LG webOS

Not re-verified against vendor documentation: Samsung's pages returned 404 or
moved to a site whose reference pages did not render, and webOS's
`appinfo.json` reference lists no network key. Known from the shipped apps,
which already reach `http://` servers on the LAN:

- Tizen: `clients/tizen/public/config.xml` declares
  `<access origin="*" subdomains="true"/>` and the
  `http://tizen.org/privilege/internet` privilege.
- webOS: `clients/webos/public/appinfo.json` declares nothing about the network.
- Both load from the device, so the page is not https and there is no mixed
  content to block; the server's CORS policy admits their `null` or `file://`
  origin (see [tv-pairing.md](../tv-pairing.md#who-may-raise-a-beacon)).
