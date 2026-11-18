# curl config file facts behind kroma-http

`kroma-http` hands curl every option as a config file on stdin (`curl -q
--config -`), so nothing reaches argv. What that relies on, with its source.
Read 2026-11-17.

## A config line has a length limit

Sources: `src/tool_parsecfg.c` at
[`curl-7_86_0`](https://github.com/curl/curl/blob/curl-7_86_0/src/tool_parsecfg.c)
and [`curl-8_2_0`](https://github.com/curl/curl/blob/curl-8_2_0/src/tool_parsecfg.c),
`src/tool_getparam.c` and `src/tool_helpers.c` at `curl-7_86_0`, and curl commit
[`e53df4cf0807`](https://github.com/curl/curl/commit/e53df4cf0807) ("tool_parsecfg:
accept line lengths up to 10M"). Read in the source, and observed on a NAS.

- `parseconfig` reads each line into a buffer capped at `MAX_CONFIG_LINE_LENGTH`.
  It is `100*1024` up to curl 8.1.x and `10*1024*1024` from 8.2.0.
- A longer line makes `parseconfig` fail, `--config` returns `PARAM_READ_ERROR`,
  and curl prints "option --config: error encountered when reading a file" and
  exits 26. No request is made.
- The cap is on the raw line, quotes and backslash escapes included, so a JSON
  body grows past its own length once `"` and `\` are escaped.
- Observed 2026-11-17 on a Synology DS918+, whose DSM ships curl 7.86.0: a
  `data-binary` line of 102,416 bytes exited 26 with the message above, and one
  of 102,316 bytes was parsed.

## What kroma-http does with it

No request body rides in the config. `post_json`, `put_json`, `post_bytes` and
`carry` write the body to a temp file and pass `data-binary = "@<file>"`, so a
config line stays short whatever the body's size.
