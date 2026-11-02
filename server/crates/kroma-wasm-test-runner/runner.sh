#!/bin/sh
set -eu
here=$(cd "$(dirname "$0")" && pwd)
target="$here/../../../target/wasm-test-runner"
(cd "$here" && cargo build --quiet --profile wasm-test-runner --target-dir "$target")
exec "$target/wasm-test-runner/kroma-wasm-test-runner" "$@"
