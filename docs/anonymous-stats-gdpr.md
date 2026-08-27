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

**Legitimate interests, Article 6(1)(f).** Statistics are on by default and an
operator switches them off in Admin → General → Privacy.

Consent is not relied on, and saying so plainly matters: a default-on switch is
not consent, and calling it consent would be the kind of claim that fails the
moment anyone reads the code.

### The balancing test

**The interest.** Knowing which versions are still running, which platforms are
still in use, which official modules have users, and which languages readers
actually ask for. Without it a version is retired by guessing, a module is
maintained or dropped by guessing, and the question of what to translate next
has no answer at all. That is a real and present interest of the project, not a
speculative one.

**Necessity.** The processing is limited to what answers those four questions.
Every field maps to one of them (see the table below), and the fields that would
answer them more precisely, exact counts and an install's address, are the ones
deliberately left out. There is no less intrusive way to learn how many servers
are running than to have servers say so.

**Balance against the operator's rights.** The data cannot be traced to a person
by the project or by anyone else it reaches: no address is stored, no account
exists, no third party holds a mapping from the identifier to a human. The
identifier is minted locally, at random, by the software. Nothing is sold,
shared, profiled or used to make a decision about anyone. Against that, the
intrusion is one HTTP request a day carrying a version string and some coarse
bands.

An operator who disagrees is not asked to justify it: the switch is in the
settings page, it takes effect at once, and the row can be erased outright with
a single request that needs nobody's permission.

**Safeguards**, each of which exists because of this balance: coarse bands
instead of counts, a device ceiling, a set of language tags rather than
per-device values, only official module ids, no address stored, a floor of five
before any breakdown is published, and deletion ninety days after a server goes
quiet.

### Transparency

Article 13 is met by this document, by
[`anonymous-stats.md`](anonymous-stats.md), by both published privacy pages, and
by the server itself: the job prints the exact bytes it sent in its own run log,
so the description here can be checked rather than believed.

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
| Object (Art. 21) | Admin → General → Privacy. Takes effect at once, and no reason is asked for. Where processing rests on legitimate interests this is the right that answers it, and here it is a switch rather than a request. |
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
