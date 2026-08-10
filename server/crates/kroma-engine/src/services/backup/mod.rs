//! Portable backup orchestration: DB rows plus the avatar files they reference,
//! packed into a ZIP ([`archive`]) with an optional encrypted envelope ([`crypto`]).

mod archive;
mod crypto;

use std::path::Path;

use anyhow::Result;
use serde_json::Value;

use crate::db::{self, BackupDoc, Pool};
use crate::infra::image::{images_dir, PUBLIC_PREFIX};

use archive::Assets;

/// Why an import couldn't proceed mapped to localized HTTP errors by the API.
#[derive(Debug)]
pub enum ImportError {
    PasswordRequired,
    // Also covers a corrupted ciphertext (the AEAD tag failed to verify).
    WrongPassword,
    Invalid(anyhow::Error),
    Db(anyhow::Error),
}

/// A non-empty `password` wraps the ZIP in an encrypted envelope; import auto-detects.
pub fn export(pool: &Pool, data_dir: &Path, password: Option<&str>) -> Result<Vec<u8>> {
    let doc = db::export_portable(pool)?;
    let assets = gather_assets(&doc, data_dir);
    let zip = archive::write_zip(&doc, &assets)?;
    match password.filter(|p| !p.is_empty()) {
        Some(pw) => crypto::seal(&zip, pw),
        None => Ok(zip),
    }
}

/// Accepts an encrypted envelope, a ZIP, or legacy v1 JSON. `reset` wipes the
/// portable tables first, atomically. Returns per-table row counts.
pub fn import(
    pool: &Pool,
    data_dir: &Path,
    bytes: &[u8],
    password: Option<&str>,
    reset: bool,
) -> std::result::Result<Vec<(String, usize)>, ImportError> {
    let (doc, assets) = decode(bytes, password)?;
    write_assets(data_dir, &assets);
    db::import_portable(pool, &doc, reset).map_err(ImportError::Db)
}

fn decode(bytes: &[u8], password: Option<&str>) -> std::result::Result<(BackupDoc, Assets), ImportError> {
    if crypto::is_encrypted(bytes) {
        let Some(pw) = password.filter(|p| !p.is_empty()) else {
            return Err(ImportError::PasswordRequired);
        };
        let zip = match crypto::open(bytes, pw) {
            Ok(Some(z)) => z,
            Ok(None) => return Err(ImportError::WrongPassword),
            Err(e) => return Err(ImportError::Invalid(e)),
        };
        return archive::read_zip(&zip).map_err(ImportError::Invalid);
    }
    if bytes.starts_with(b"PK\x03\x04") {
        return archive::read_zip(bytes).map_err(ImportError::Invalid);
    }
    if bytes.iter().copied().find(|b| !b.is_ascii_whitespace()) == Some(b'{') {
        return archive::read_legacy_json(bytes).map_err(ImportError::Invalid);
    }
    Err(ImportError::Invalid(anyhow::anyhow!("unrecognized backup format")))
}

fn gather_assets(doc: &BackupDoc, data_dir: &Path) -> Assets {
    let dir = images_dir(data_dir);
    let mut out = Assets::new();
    let mut seen = std::collections::HashSet::new();
    for user in doc.tables.get("users").into_iter().flatten() {
        let Some(name) = user.get("avatar_url").and_then(Value::as_str).and_then(local_image_name)
        else {
            continue;
        };
        if seen.insert(name.to_string()) {
            if let Ok(bytes) = std::fs::read(dir.join(name)) {
                out.push((name.to_string(), bytes));
            }
        }
    }
    out
}

fn write_assets(data_dir: &Path, assets: &Assets) {
    let dir = images_dir(data_dir);
    std::fs::create_dir_all(&dir).ok();
    for (name, bytes) in assets {
        if !is_safe_name(name) {
            continue; // never let a backup write outside the cache dir
        }
        let path = dir.join(name);
        if !path.exists() {
            let _ = std::fs::write(&path, bytes);
        }
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
    use super::*;
    use kroma_testing::TempDir;

    fn fresh(tag: &str) -> (Pool, TempDir) {
        let data = kroma_testing::temp_dir(&format!("bksvc-{tag}"));
        std::fs::create_dir_all(images_dir(data.path())).unwrap();
        let pool = crate::db::init(&data.path().join("kroma.db")).unwrap();
        (pool, data)
    }

    fn seed_user_with_avatar(pool: &Pool, data_dir: &Path) {
        std::fs::write(images_dir(data_dir).join("av99.webp"), b"AVATAR").unwrap();
        pool.get()
            .unwrap()
            .execute(
                "INSERT INTO users (id,email,username,password_hash,avatar_url,created_at) \
                 VALUES ('u1','a@b.c','Al','ph','/api/images/av99.webp','t')",
                [],
            )
            .unwrap();
    }

    fn user_count(pool: &Pool) -> i64 {
        pool.get().unwrap().query_row("SELECT COUNT(*) FROM users", [], |r| r.get(0)).unwrap()
    }

    #[test]
    fn zip_round_trip_restores_rows_and_avatar() {
        let (src, src_dir) = fresh("src");
        seed_user_with_avatar(&src, src_dir.path());
        let bytes = export(&src, src_dir.path(), None).unwrap();
        assert!(bytes.starts_with(b"PK\x03\x04"), "unencrypted .kroma is a zip");

        let (dst, dst_dir) = fresh("dst");
        import(&dst, dst_dir.path(), &bytes, None, false).unwrap();
        assert_eq!(user_count(&dst), 1);
        assert_eq!(std::fs::read(images_dir(dst_dir.path()).join("av99.webp")).unwrap(), b"AVATAR");
    }

    #[test]
    fn encrypted_round_trip_and_password_errors() {
        let (src, src_dir) = fresh("esrc");
        seed_user_with_avatar(&src, src_dir.path());
        let sealed = export(&src, src_dir.path(), Some("hunter2")).unwrap();
        assert!(crypto::is_encrypted(&sealed));

        let (dst, dst_dir) = fresh("edst");
        assert!(matches!(import(&dst, dst_dir.path(), &sealed, None, false), Err(ImportError::PasswordRequired)));
        assert!(matches!(import(&dst, dst_dir.path(), &sealed, Some("nope"), false), Err(ImportError::WrongPassword)));
        import(&dst, dst_dir.path(), &sealed, Some("hunter2"), false).unwrap();
        assert_eq!(user_count(&dst), 1);
    }

    #[test]
    fn a_backup_from_before_the_zip_format_still_restores() {
        let (dst, dst_dir) = fresh("legacy");
        let legacy = br#"
{"version":1,"exported_at":"t","assets":{"av99.webp":"4156"},
 "tables":{"users":[{"id":"u1","email":"a@b.c","username":"Al","password_hash":"ph","created_at":"t"}]}}
"#;

        import(&dst, dst_dir.path(), legacy, None, false).unwrap();
        assert_eq!(user_count(&dst), 1);
        assert_eq!(std::fs::read(images_dir(dst_dir.path()).join("av99.webp")).unwrap(), b"AV");
    }

    #[test]
    fn bytes_that_are_no_backup_at_all_are_named_as_such() {
        let (dst, dst_dir) = fresh("junk");
        for junk in [&b"not a backup"[..], &b""[..], &b"\x89PNG\r\n"[..]] {
            assert!(matches!(
                import(&dst, dst_dir.path(), junk, None, false),
                Err(ImportError::Invalid(_))
            ));
        }
    }

    #[test]
    fn a_truncated_envelope_is_invalid_rather_than_a_wrong_password() {
        let (dst, dst_dir) = fresh("trunc");
        let mut truncated = b"KROMABK1\n".to_vec();
        truncated.extend_from_slice(&[1, 1, 0, 0, 0, 1]);
        assert!(crypto::is_encrypted(&truncated));
        assert!(matches!(
            import(&dst, dst_dir.path(), &truncated, Some("hunter2"), false),
            Err(ImportError::Invalid(_))
        ));
    }

    #[test]
    fn an_asset_naming_a_path_is_never_written_outside_the_cache() {
        let (_pool, dir) = fresh("assets");
        let assets: Assets = vec![
            ("../escape.webp".to_string(), b"NOPE".to_vec()),
            ("sub/dir.webp".to_string(), b"NOPE".to_vec()),
            (String::new(), b"NOPE".to_vec()),
            ("ok.webp".to_string(), b"YES".to_vec()),
        ];
        write_assets(dir.path(), &assets);

        assert_eq!(std::fs::read(images_dir(dir.path()).join("ok.webp")).unwrap(), b"YES");
        assert!(!images_dir(dir.path()).parent().unwrap().join("escape.webp").exists());
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

        let doc = crate::db::export_portable(&pool).unwrap();
        let assets = gather_assets(&doc, dir.path());
        assert_eq!(assets.len(), 1);
        assert_eq!(assets[0].0, "av99.webp");

        pool.get()
            .unwrap()
            .execute(
                "INSERT INTO users (id,email,username,password_hash,avatar_url,created_at) \
                 VALUES ('u3','c@b.c','Cy','ph','/api/images/av99.webp','t')",
                [],
            )
            .unwrap();
        let doc = crate::db::export_portable(&pool).unwrap();
        assert_eq!(gather_assets(&doc, dir.path()).len(), 1);
    }

    #[test]
    fn reset_wipes_pre_existing_rows() {
        let (src, src_dir) = fresh("rsrc");
        seed_user_with_avatar(&src, src_dir.path());
        let bytes = export(&src, src_dir.path(), None).unwrap();

        let (dst, dst_dir) = fresh("rdst");
        // A pre-existing account on the target that's NOT in the backup.
        dst.get().unwrap().execute(
            "INSERT INTO users (id,email,username,password_hash,created_at) VALUES ('keep','k@b.c','K','ph','t')", []).unwrap();

        import(&dst, dst_dir.path(), &bytes, None, false).unwrap();
        assert_eq!(user_count(&dst), 2);
        import(&dst, dst_dir.path(), &bytes, None, true).unwrap();
        assert_eq!(user_count(&dst), 1);
    }
}
