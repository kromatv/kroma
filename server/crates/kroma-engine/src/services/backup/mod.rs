//! Portable backup orchestration: DB rows plus the files they reference
//! ([`assets`]), packed into a ZIP ([`archive`]) with an optional encrypted
//! envelope ([`crypto`]).

mod archive;
mod assets;
mod crypto;

#[cfg(test)]
mod test_support;

use std::path::Path;

use anyhow::Result;

use crate::db::{self, BackupDoc, Pool};

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
    let mut doc = db::export_portable(pool, data_dir)?;
    let files = assets::gather(&mut doc, data_dir);
    let zip = archive::write_zip(&doc, &files)?;
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
    let (mut doc, files) = decode(bytes, password)?;
    assets::write(data_dir, &files);
    assets::rebase_subtitles(&mut doc, data_dir);
    db::import_portable(pool, data_dir, &doc, reset).map_err(ImportError::Db)
}

fn decode(
    bytes: &[u8],
    password: Option<&str>,
) -> std::result::Result<(BackupDoc, Assets), ImportError> {
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
    Err(ImportError::Invalid(anyhow::anyhow!(
        "unrecognized backup format"
    )))
}

#[cfg(test)]
mod tests {
    use super::test_support::*;
    use super::*;
    use crate::infra::image::images_dir;
    use crate::services::subtitles::downloaded_dir;

    #[test]
    fn zip_round_trip_restores_rows_and_avatar() {
        let (src, src_dir) = fresh("src");
        seed_user_with_avatar(&src, src_dir.path());
        let bytes = export(&src, src_dir.path(), None).unwrap();
        assert!(
            bytes.starts_with(b"PK\x03\x04"),
            "unencrypted .kroma is a zip"
        );

        let (dst, dst_dir) = fresh("dst");
        import(&dst, dst_dir.path(), &bytes, None, false).unwrap();
        assert_eq!(user_count(&dst), 1);
        assert_eq!(
            std::fs::read(images_dir(dst_dir.path()).join("av99.webp")).unwrap(),
            b"AVATAR"
        );
    }

    #[test]
    fn a_subtitle_comes_back_with_its_file_under_the_new_data_dir() {
        let (src, src_dir) = fresh("sub-src");
        seed_subtitle(&src, src_dir.path(), "s1", b"WEBVTT\n\nhello");
        let bytes = export(&src, src_dir.path(), None).unwrap();
        let (dst, dst_dir) = fresh("sub-dst");

        import(&dst, dst_dir.path(), &bytes, None, false).unwrap();

        let path = subtitle_path(&dst, "s1").unwrap();
        assert_eq!(
            path,
            downloaded_dir(dst_dir.path())
                .join("s1.vtt")
                .to_string_lossy()
        );
        assert_eq!(std::fs::read(path).unwrap(), b"WEBVTT\n\nhello");
    }

    #[test]
    fn encrypted_round_trip_and_password_errors() {
        let (src, src_dir) = fresh("esrc");
        seed_user_with_avatar(&src, src_dir.path());
        let sealed = export(&src, src_dir.path(), Some("hunter2")).unwrap();
        assert!(crypto::is_encrypted(&sealed));

        let (dst, dst_dir) = fresh("edst");
        assert!(matches!(
            import(&dst, dst_dir.path(), &sealed, None, false),
            Err(ImportError::PasswordRequired)
        ));
        assert!(matches!(
            import(&dst, dst_dir.path(), &sealed, Some("nope"), false),
            Err(ImportError::WrongPassword)
        ));
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
        assert_eq!(
            std::fs::read(images_dir(dst_dir.path()).join("av99.webp")).unwrap(),
            b"AV"
        );
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
