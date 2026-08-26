# Anonymous statistics: the GDPR record

The companion to [`anonymous-stats.md`](anonymous-stats.md), which describes what
is sent. This one is the legal record for it: who is responsible, on what basis,
for how long, and what a person can demand. It exists because Article 30 asks for
one, and because a privacy feature whose compliance story is unwritten is a
privacy feature nobody should switch on.

Nothing here overrides [`PRIVACY.md`](../PRIVACY.md) or the policy published at
kroma.tv/privacy. Where they disagree, they are wrong and should be fixed.

## Is this personal data at all?

Probably not, and it is treated as though it might be.

A payload names a server, not a person. It carries no name, no email, no address,
no IP, no file path, no title, and no exact count of anything. Set beside a
million installs it is a row of versions and bands.

But a KROMA server is often run by one person on hardware in their home, and the
payload carries a persistent random identifier alongside a country and a set of
language tags. Recital 26 asks whether a natural person can be singled out by
means reasonably likely to be used. For a single-operator install the honest
answer is "conceivably", so the identifier is treated as an online identifier
under Article 4(1) and the whole of what follows applies. The alternative,
arguing the data out of scope and offering nothing, is the position that ages
badly.

## Controller and contact

Maxime Scharwath, publisher of KROMA and operator of the kroma.tv domain. Not a
company, and no data protection officer is appointed: Article 37 does not require
one here, since this is neither a public authority nor large-scale or systematic
monitoring.

privacy@kroma.tv

The operator of a KROMA server is the controller for everything on their own
machine. This record covers only what leaves it.

## Legal basis

**Consent, Article 6(1)(a).** Nothing else is relied on, and legitimate interest
is deliberately not claimed.

The consent has to be worth the name, so:

- **Freely given.** KROMA works identically with statistics off, which is how it
  ships. Nothing is withheld, degraded, or nagged about.
- **Specific.** The toggle does one thing. It is not bundled with updates, crash
  reports or anything else.
- **Informed.** Every field is documented, and the server prints the exact bytes
  in its own job log before sending them, so the description can be checked
  rather than believed.
- **Unambiguous.** A switch an administrator moves, defaulted off. No pre-ticked
  box, no consent inferred from continued use.
- **Withdrawable as easily as given.** The same switch, taking effect on the next
  run, with no explanation asked for.

## What is processed

| Category | Field | Why it is collected |
|---|---|---|
| Pseudonymous identifier | `id` | To count servers once rather than once a day. 32 random bytes minted locally, not derived from hardware, not the identifier served on `/api/health`. |
| Software version | `version`, `commit` | To know when a release can stop being supported. |
| Platform | `target`, `install` | To know which operating systems and packagings are still in use. Only the OS half of the build triple is stored. |
| Usage scale | `clients`, `users`, `titles` | To know how many devices a server serves. Device counts are capped at 50; users and titles are coarse bands, never counts. |
| Language preference | `locales` | To know which languages to translate into. The set of tags devices asked for, never per-device and never counted. |
| Enabled modules | `modules` | To know which official modules are worth maintaining. Modules from any other catalog are never named. |
| Approximate location | derived country | A two-letter code Cloudflare derives at the edge from the connection. Never sent by the server, and the address it came from is not stored. |

**Not processed, at all:** IP addresses, server names, hostnames, URLs, ports,
media titles, file paths, watch history, search queries, account names, email
addresses, avatars, exact user or title counts, and the ids of modules installed
from a third-party registry.

There is no profiling and no automated decision-making within the meaning of
Article 22. The data is counted and nothing else is done with it.

## Recipients and location

**Cloudflare, Inc.**, as processor, running the collector (Workers) and holding
the database (D1). No other recipient. The data is not sold, shared, used for
advertising, or given to anyone else.

The database was created in Cloudflare's Western Europe region. Cloudflare is a
United States company, so any transfer outside the EEA is governed by its data
processing addendum and the Standard Contractual Clauses it incorporates.

Cloudflare terminates the HTTPS connection and therefore sees the connecting
address, as any host does. The collector does not read it into any column: it
reads only the two-letter country code Cloudflare derives, and the address goes
when the request does. Cloudflare's own edge logs are its processing under that
addendum.

## Retention

- A row lives while its server keeps reporting, and for **90 days** after the
  last report. Then it is deleted by the nightly job.
- A row stops counting toward anything published **30 days** after its last
  report.
- The daily series and every published figure carry no identifier and are not
  personal data. They are kept indefinitely, which is the point of a history.

## Rights, and how to exercise them without asking anyone

| Right | How |
|---|---|
| Withdraw consent (Art. 7(3)) | Admin → General → Privacy. Takes effect at once. |
| Access (Art. 15) | Admin → Jobs → Anonymous statistics → Run now prints the exact payload. The identifier is shown in Admin → General → Privacy. |
| Erasure (Art. 17) | `POST https://stats.kroma.tv/v1/forget` with `{"id":"<your identifier>"}`. Self-service, immediate, no request to anyone. Withdraw consent first: a server still reporting writes the row again the next day. |
| Rectification (Art. 16) | The next day's payload replaces the row. |
| Portability (Art. 20) | The payload is JSON, printed by the server that produced it. |
| Object, or complain | privacy@kroma.tv, and the right to lodge a complaint with a supervisory authority, in Switzerland the FDPIC and in the EU the authority for your country. |

The erasure endpoint is authorised by the identifier itself, on the same rule the
rest of the collector runs on: holding it is the whole authorisation and it
reaches exactly one row. It answers the same way whether a row was there or not,
so it cannot be used to test whether an identifier exists.

## Security of processing (Art. 32)

- HTTPS only, and the collector's address is compiled into the server rather than
  configured, so an operator cannot be pointed at somebody else's collector.
- No credential exists to steal. A payload carries nothing worth taking and there
  is nobody to authenticate.
- No route returns a row. Reads answer aggregates, and any breakdown fewer than
  five servers share is suppressed before it is published.
- The one route that answers unsuppressed aggregates, `/v1/admin/stats`, is
  behind Cloudflare Access: a short-lived assertion signed by a key only
  Cloudflare holds, checked by the Worker itself rather than assumed from the
  edge, and refused outright when no administrator is configured. It still
  returns no rows. Access to individual rows is through the database, against the
  Cloudflare account, and is logged there.
- Data minimisation is the main control here: the strongest protection for a
  field is that it was never collected.

## Swiss law

KROMA is published from Switzerland, so the revised Federal Act on Data
Protection applies alongside the GDPR. Its requirements are met by the same
measures: the processing is consented to, minimal, documented here, and
erasable on request.

## Changes

A new field, a new recipient, or a new retention period is a change to this
document and to the payload's schema number in the same commit. The history of
this file is the record of what changed and when.
