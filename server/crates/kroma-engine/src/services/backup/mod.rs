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
    use std::sync::atomic::{AtomicU32, Ordering};

    static SEQ: AtomicU32 = AtomicU32::new(0);

    fn fresh(tag: &str) -> (Pool, std::path::PathBuf) {
        let n = SEQ.fetch_add(1, Ordering::Relaxed);
        let data = std::env::temp_dir().join(format!("kroma-bksvc-{tag}-{}-{n}", std::process::id()));
        let _ = std::fs::remove_dir_all(&data);
        std::fs::create_dir_all(images_dir(&data)).unwrap();
        let pool = crate::db::init(&data.join("kroma.db")).unwrap();
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
        seed_user_with_avatar(&src, &src_dir);
        let bytes = export(&src, &src_dir, None).unwrap();
        assert!(bytes.starts_with(b"PK\x03\x04"), "unencrypted .kroma is a zip");

        let (dst, dst_dir) = fresh("dst");
        import(&dst, &dst_dir, &bytes, None, false).unwrap();
        assert_eq!(user_count(&dst), 1);
        assert_eq!(std::fs::read(images_dir(&dst_dir).join("av99.webp")).unwrap(), b"AVATAR");
    }

    #[test]
    fn encrypted_round_trip_and_password_errors() {
        let (src, src_dir) = fresh("esrc");
        seed_user_with_avatar(&src, &src_dir);
        let sealed = export(&src, &src_dir, Some("hunter2")).unwrap();
        assert!(crypto::is_encrypted(&sealed));

        let (dst, dst_dir) = fresh("edst");
        assert!(matches!(import(&dst, &dst_dir, &sealed, None, false), Err(ImportError::PasswordRequired)));
        assert!(matches!(import(&dst, &dst_dir, &sealed, Some("nope"), false), Err(ImportError::WrongPassword)));
        import(&dst, &dst_dir, &sealed, Some("hunter2"), false).unwrap();
        assert_eq!(user_count(&dst), 1);
    }

    #[test]
    fn reset_wipes_pre_existing_rows() {
        let (src, src_dir) = fresh("rsrc");
        seed_user_with_avatar(&src, &src_dir);
        let bytes = export(&src, &src_dir, None).unwrap();

        let (dst, dst_dir) = fresh("rdst");
        // A pre-existing account on the target that's NOT in the backup.
        dst.get().unwrap().execute(
            "INSERT INTO users (id,email,username,password_hash,created_at) VALUES ('keep','k@b.c','K','ph','t')", []).unwrap();

        import(&dst, &dst_dir, &bytes, None, false).unwrap();
        assert_eq!(user_count(&dst), 2);
        import(&dst, &dst_dir, &bytes, None, true).unwrap();
        assert_eq!(user_count(&dst), 1);
    }
}
