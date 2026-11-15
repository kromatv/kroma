---
name: add-dependency
description: The checks to run before adding, updating or removing a third-party package, in any ecosystem (npm, cargo, pip, a vendored tool). Covers need, security history, maintenance, install scripts, release age, licence, the size of the tree it brings, and where the dependency is declared. Use before any install or version change, and when choosing between a library and a few lines of your own code. Triggers - "add a dependency", "install a package", "bun add", "cargo add", "bump this package", "which library should we use", "do we need a library for this".
---

# Add a dependency

Every package installed is code nobody here reviewed, running with the rights of
the build or of the product. A dependency earns its place when it replaces code
that is dangerous to write by hand (crypto, parsing, protocols, auth) or a large
amount of code. A few plain lines are better than a package.

Read the project's own documents first. Where it states which licences it
accepts, how versions are pinned, or which registry it uses, that wins over
anything below.

## Before the install, all of these

1. **Need.** Say in one sentence what the package does for this project, and why
   the platform or a dependency already in the lockfile does not do it.
2. **Security.** Look up its advisories (the registry's audit command, or the
   advisory database of the ecosystem). No open high or critical issue. Read how
   fast past ones were fixed.
3. **Maintenance.** A release in the last twelve months, more than one
   maintainer or an organisation behind it, issues that get answers.
4. **Install scripts.** Does it, or anything it brings, run code at install
   time? If the package manager blocks such scripts by default, a package that
   needs one is listed where the project lists them, with the reason, in the
   same commit. If nothing needs the script, it stays blocked.
5. **Age.** Prefer a version that has been public for at least a week. A
   release from this morning has been read by nobody.
6. **Licence.** Compatible with the project's own. When the project does not
   say which licences it takes, ask before adding anything that is not
   permissive (MIT, ISC, BSD, Apache-2.0, 0BSD).
7. **Tree.** Count what it brings with it (the lockfile diff, or the package
   manager's "why" command). A large tree for a small need is a no.
8. **Shipped size.** If it ends up in something a user downloads (a bundle, a
   binary, an image), measure what it adds before and after.

## The install

- Declare it in the package that imports it, not at the root "to be safe".
  Runtime code goes in runtime dependencies, tools in development ones.
- Pin the way the project pins. Where it pins exact versions, pin exact.
- Use the package manager's own command, so the manifest and the lockfile
  change together. Never edit a lockfile by hand.
- One commit for the manifest and the lockfile, with the checks above in the
  message: what it is for, what you looked at, what it brings.

## Updating

Read the changelog between the two versions before changing the number. A major
version is a change of contract: find every call site. Run the tests that
exercise the package, not only the ones that pass by.

## Removing

When code stops using a package, remove it in the same commit, with the package
manager's remove command. A dependency nobody imports is still installed, still
scanned, and still someone's supply chain.

## Report

Say what you added or removed, the version, the answers to the eight checks in
one line each, and the lockfile diff in numbers (packages added, removed).
