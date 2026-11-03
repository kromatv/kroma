---
name: reference-first
description: Ground platform and integration code in documented facts instead of memory. Before writing code that depends on how an external platform, SDK, protocol or vendor behaves (key names, manifest fields, event payloads, threading rules, supported formats, store requirements), read the project's reference docs for that area; when the fact is missing, research it from the official source, cite it, and add it to the reference in the same change. Use when implementing or debugging native, OS, device, SDK or third-party integration code, or when a behaviour "should" work a certain way. Triggers - "how does the platform handle", "what key name", "is this supported on", "according to the docs", "port to a new platform", "native module", "why does the TV".
---

# Reference first

A platform behaviour written from memory is a bug with a delay. The fix is
cheap: look it up once, write it down with its source, and let every later
change read the written version.

## Before writing the code

1. Find the project's reference for the area (a `docs/reference/` directory, a
   package `CLAUDE.md` that maps code to reference files, or the architecture
   docs). Read the section the change depends on.
2. If the fact is there, follow it. If the code disagrees with it, the code is
   the suspect.
3. If the fact is missing or vague, research it before coding:
   - the vendor's official documentation and API reference;
   - the SDK's own headers and sources (installed SDKs ship them);
   - a mature project already shipping on that platform, read at its source.
4. Write what you found into the reference in the same change: the fact, a link
   or a file and line, how it is known (documented, inferred from what, or
   verified on which device), and which versions it applies to.

## While debugging

- Check the reference before guessing at a cause. Many "mystery" bugs are a rule
  the platform documents.
- When hardware contradicts the documentation, trust the hardware, record both,
  and say which device showed it.
- A fix that came from an experiment still gets a reference entry, so the next
  change does not rediscover it.

## What not to do

- Do not state an assumption as a fact, in code or in docs. Mark it inferred, or
  leave it as an open question.
- Do not copy whole vendor pages into the repository. Record the facts the code
  depends on, with a link to the page.
- Do not cite from memory. A citation you did not open is not a citation.
