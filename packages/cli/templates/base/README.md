# __NAME__

A KROMA module (`__ID__`).

```bash
bunx kroma login http://localhost:4040   # once, an account with settings.manage
bunx kroma dev                      # build, install, rebuild on every save
bunx kroma check                    # manifest, types, clippy
bunx kroma build                    # dist/modules/__ID__.kmod
```

Layout: `module.json` is the manifest, `ui/` the page a KROMA client renders,
`server/` the sidecar the server spawns, `locales/` the strings. See
https://github.com/kromatv/kroma/blob/main/modules/README.md.
