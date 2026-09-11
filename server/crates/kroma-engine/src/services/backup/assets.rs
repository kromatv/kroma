//! The files a backup packs beside its rows: the avatars users uploaded, and the
//! subtitles this server generated or downloaded.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde_json::{Map, Value};

use crate::db::BackupDoc;
use crate::infra::image::{images_dir, PUBLIC_PREFIX};
use crate::services::subtitles::downloaded_dir;

use super::archive::{Asset, Assets, Folder};

const SUBTITLES: &str = "downloaded_subtitles";

/// Every file the rows of `doc` point at. A subtitle row whose file is gone is
/// removed from `doc`.
pub fn gather(doc: &mut BackupDoc, data_dir: &Path) -> Assets {
    let mut files = avatars(doc, data_dir);
    files.extend(subtitles(doc, data_dir));
    files
}

/// Put each file back in its folder, never over one already there.
pub fn write(data_dir: &Path, files: &Assets) {
    for file in files.iter().filter(|f| is_safe_name(&f.name)) {
        let dir = folder_dir(data_dir, file.folder);
        std::fs::create_dir_all(&dir).ok();
        let path = dir.join(&file.name);
        if !path.exists() {
            let _ = std::fs::write(&path, &file.bytes);
        }
    }
}

/// Point each restored subtitle at this server's copy of its file, wherever the
/// source kept it. A row that names no file is dropped.
pub fn rebase_subtitles(doc: &mut BackupDoc, data_dir: &Path) {
    let dir = downloaded_dir(data_dir);
    let Some(rows) = doc.tables.get_mut(SUBTITLES) else {
        return;
    };
    rows.retain_mut(|row| {
        let Some(name) = file_name(row).map(str::to_string) else {
            return false;
        };
        let path = dir.join(name).to_string_lossy().into_owned();
        row.insert("path".to_string(), Value::from(path));
        true
    });
}

fn avatars(doc: &BackupDoc, data_dir: &Path) -> Assets {
    let dir = images_dir(data_dir);
    let mut out = Assets::new();
    let mut seen = HashSet::new();
    for user in doc.tables.get("users").into_iter().flatten() {
        let Some(name) = user
            .get("avatar_url")
            .and_then(Value::as_str)
            .and_then(local_image_name)
        else {
            continue;
        };
        if seen.insert(name.to_string()) {
            if let Ok(bytes) = std::fs::read(dir.join(name)) {
                out.push(Asset {
                    folder: Folder::Images,
                    name: name.to_string(),
                    bytes,
                });
            }
        }
    }
    out
}

fn subtitles(doc: &mut BackupDoc, data_dir: &Path) -> Assets {
    let dir = downloaded_dir(data_dir);
    let mut out = Assets::new();
    let mut packed: HashSet<String> = HashSet::new();
    let Some(rows) = doc.tables.get_mut(SUBTITLES) else {
        return out;
    };
    rows.retain(|row| {
        let Some(name) = file_name(row) else {
            return false;
        };
        if packed.contains(name) {
            return true;
        }
        let Ok(bytes) = std::fs::read(dir.join(name)) else {
            return false;
        };
        packed.insert(name.to_string());
        out.push(Asset {
            folder: Folder::Subtitles,
            name: name.to_string(),
            bytes,
        });
        true
    });
    out
}

fn file_name(row: &Map<String, Value>) -> Option<&str> {
    let path = row.get("path")?.as_str()?;
    path.rsplit(['/', '\\'])
        .next()
        .filter(|name| is_safe_name(name))
}

fn folder_dir(data_dir: &Path, folder: Folder) -> PathBuf {
    match folder {
        Folder::Images => images_dir(data_dir),
        Folder::Subtitles => downloaded_dir(data_dir),
    }
}

fn local_image_name(url: &str) -> Option<&str> {
    url.strip_prefix(PUBLIC_PREFIX).filter(|n| is_safe_name(n))
}

fn is_safe_name(name: &str) -> bool {
    !name.is_empty() && !name.contains('/') && !name.contains('\\') && !name.contains("..")
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::*;
    use crate::services::backup::test_support::{fresh, seed_subtitle, seed_user_with_avatar};

    fn restored(paths: &[Option<&str>]) -> BackupDoc {
        let rows = paths
            .iter()
            .map(|path| {
                let mut row = Map::new();
                row.insert("id".to_string(), Value::from("s1"));
                if let Some(path) = path {
                    row.insert("path".to_string(), Value::from(*path));
                }
                row
            })
            .collect();
        BackupDoc {
            version: 1,
            exported_at: "t".into(),
            tables: BTreeMap::from([(SUBTITLES.to_string(), rows)]),
            assets: BTreeMap::new(),
            modules: BTreeMap::new(),
        }
    }

    fn image(name: &str, bytes: &[u8]) -> Asset {
        Asset {
            folder: Folder::Images,
            name: name.to_string(),
            bytes: bytes.to_vec(),
        }
    }

    #[test]
    fn a_subtitle_whose_file_is_gone_is_left_out_of_the_backup() {
        let (pool, dir) = fresh("sub-gone");
        seed_subtitle(&pool, dir.path(), "s1", b"WEBVTT");
        std::fs::remove_file(downloaded_dir(dir.path()).join("s1.vtt")).unwrap();
        let mut doc = crate::db::export_portable(&pool, dir.path()).unwrap();

        let files = gather(&mut doc, dir.path());

        assert!(files.is_empty());
        assert!(doc.tables[SUBTITLES].is_empty());
    }

    #[test]
    fn a_restored_subtitle_points_at_this_servers_copy_from_a_unix_or_a_windows_source() {
        let mut doc = restored(&[
            Some("/old/box/subs/downloaded/s1.vtt"),
            Some(r"C:\kroma\subs\downloaded\s1.vtt"),
        ]);
        let here = Path::new("/new/box");

        rebase_subtitles(&mut doc, here);

        let expected = Value::from(
            downloaded_dir(here)
                .join("s1.vtt")
                .to_string_lossy()
                .into_owned(),
        );
        let paths: Vec<&Value> = doc.tables[SUBTITLES]
            .iter()
            .map(|row| &row["path"])
            .collect();
        assert_eq!(paths, vec![&expected, &expected]);
    }

    #[test]
    fn a_restored_subtitle_that_names_no_file_is_dropped() {
        let mut doc = restored(&[None, Some("/data/subs/downloaded/"), Some("/data/..")]);

        rebase_subtitles(&mut doc, Path::new("/new/box"));

        assert!(doc.tables[SUBTITLES].is_empty());
    }

    #[test]
    fn an_asset_naming_a_path_is_never_written_outside_the_cache() {
        let (_pool, dir) = fresh("assets");
        let files = vec![
            image("../escape.webp", b"NOPE"),
            image("sub/dir.webp", b"NOPE"),
            image("", b"NOPE"),
            image("ok.webp", b"YES"),
        ];

        write(dir.path(), &files);

        assert_eq!(
            std::fs::read(images_dir(dir.path()).join("ok.webp")).unwrap(),
            b"YES"
        );
        assert!(!images_dir(dir.path())
            .parent()
            .unwrap()
            .join("escape.webp")
            .exists());
    }

    #[test]
    fn an_avatar_that_is_not_a_cached_image_is_not_gathered() {
        let (pool, dir) = fresh("gather");
        seed_user_with_avatar(&pool, dir.path());
        pool.get()
            .unwrap()
            .execute(
                "INSERT INTO users (id,email,username,password_hash,avatar_url,created_at) \
                 VALUES ('u2','b@b.c','Bo','ph','https://gravatar.example/x.png','t')",
                [],
            )
            .unwrap();

        let mut doc = crate::db::export_portable(&pool, pool.path().parent().unwrap()).unwrap();
        let files = gather(&mut doc, dir.path());
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].name, "av99.webp");

        pool.get()
            .unwrap()
            .execute(
                "INSERT INTO users (id,email,username,password_hash,avatar_url,created_at) \
                 VALUES ('u3','c@b.c','Cy','ph','/api/images/av99.webp','t')",
                [],
            )
            .unwrap();
        let mut doc = crate::db::export_portable(&pool, pool.path().parent().unwrap()).unwrap();
        assert_eq!(gather(&mut doc, dir.path()).len(), 1);
    }
}
