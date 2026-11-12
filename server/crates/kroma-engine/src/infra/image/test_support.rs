use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use crate::model::Metadata;

use super::images_dir;

pub const SCOPE: &str = "kroma-image-fake";

const ARGS_GUARD: &str = r#"case "$*" in *{scope}*) ;; *) {real_path}; exec {tool} "$@";; esac"#;

const CONFIG_GUARD: &str = r#"config=$(cat)
case "$config" in *{scope}*) ;; *) {real_path}; printf '%s\n' "$config" | {tool} "$@"; exit;; esac"#;

const CURL: &str = r#"option() { printf '%s\n' "$config" | sed -n "s/^$1 = \"\(.*\)\"\$/\1/p"; }
url=$(option url)
case "$url" in *bad*) exit 22;; esac
printf 'HTTP/1.1 200 OK\r\n\r\n' > "$(option dump-header)"
echo "$url" > "$(option output)"
"#;

const CWEBP: &str = r#"prev=
for a in "$@"; do
  [ "$prev" = -o ] && out=$a
  [ "$a" = -o ] && src=$prev
  prev=$a
done
case "$src" in *cwebp-fails*) exit 1;; esac
echo "$*" > "$out"
"#;

const FFMPEG: &str = r#"prev=
for a in "$@"; do
  [ "$prev" = -i ] && src=$a
  out=$a
  prev=$a
done
case "$src" in *ffmpeg-fails*) exit 1;; esac
case "$*" in *libwebp*) case "$src" in *no-libwebp*) exit 1;; esac;; esac
echo "$*" > "$out"
"#;

const FFPROBE: &str = r#"for a in "$@"; do src=$a; done
cat "$src"
"#;

pub fn install_fake_tools() {
    static INSTALLED: OnceLock<()> = OnceLock::new();
    INSTALLED.get_or_init(|| {
        let dir = std::env::temp_dir().join("kroma-image-tool-fakes");
        std::fs::create_dir_all(&dir).unwrap();
        for (tool, guard, body) in [
            ("curl", CONFIG_GUARD, CURL),
            ("cwebp", ARGS_GUARD, CWEBP),
            ("ffmpeg", ARGS_GUARD, FFMPEG),
            ("ffprobe", ARGS_GUARD, FFPROBE),
        ] {
            write_tool(&dir, tool, guard, body);
        }
        let path = std::env::var_os("PATH").unwrap_or_default();
        let mut paths = vec![dir];
        paths.extend(std::env::split_paths(&path));
        std::env::set_var("PATH", std::env::join_paths(paths).unwrap());
    });
}

fn write_tool(dir: &Path, tool: &str, guard: &str, body: &str) {
    let real_path = format!("PATH=\"${{PATH#{}:}}\"", dir.display());
    let guard = guard
        .replace("{scope}", SCOPE)
        .replace("{real_path}", &real_path)
        .replace("{tool}", tool);
    let script = format!("#!/bin/sh\n{guard}\n{body}");
    let staged = dir.join(format!("{tool}.{}", std::process::id()));
    std::fs::write(&staged, script).unwrap();
    std::fs::set_permissions(&staged, std::fs::Permissions::from_mode(0o700)).unwrap();
    std::fs::rename(&staged, dir.join(tool)).unwrap();
}

pub fn scoped_dir() -> kroma_testing::TempDir {
    install_fake_tools();
    kroma_testing::temp_dir(SCOPE)
}

pub fn put_image(data_dir: &Path, name: &str, contents: &str) -> PathBuf {
    let dir = images_dir(data_dir);
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join(name), contents).unwrap();
    dir.join(name)
}

pub fn metadata(poster: &str, backdrop: &str, logo: &str, profile: &str) -> Metadata {
    serde_json::from_value(serde_json::json!({
        "tmdbId": 1,
        "genres": [],
        "tmdbUrl": "https://tmdb.example/1",
        "posterUrl": poster,
        "backdropUrl": backdrop,
        "logoUrl": logo,
        "cast": [{ "name": "A", "profileUrl": profile }],
    }))
    .unwrap()
}
