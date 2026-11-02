use std::fs::File;
use std::path::{Component, Path};

use anyhow::Result;
use flate2::read::GzDecoder;
use tar::Archive;

pub(super) fn unpack(tarball: &[u8], into: &Path) -> Result<()> {
    let mut archive = Archive::new(GzDecoder::new(tarball));
    for entry in archive.entries()? {
        let mut entry = entry?;
        let kind = entry.header().entry_type();
        if !kind.is_file() && !kind.is_dir() {
            continue;
        }
        let path = entry.path()?.into_owned();
        if !path
            .components()
            .all(|part| matches!(part, Component::Normal(_) | Component::CurDir))
        {
            continue;
        }
        let dest = into.join(path);
        if kind.is_dir() {
            std::fs::create_dir_all(&dest)?;
            continue;
        }
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::io::copy(&mut entry, &mut File::create(&dest)?)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use flate2::write::GzEncoder;
    use flate2::Compression;
    use tar::{Builder, EntryType, Header};

    use super::super::test_support::tmpdir;
    use super::*;

    fn entry(path: &str, kind: EntryType, body: &[u8]) -> (Header, Vec<u8>) {
        let mut header = Header::new_ustar();
        header.as_old_mut().name[..path.len()].copy_from_slice(path.as_bytes());
        header.set_size(body.len() as u64);
        header.set_entry_type(kind);
        header.set_mode(0o644);
        header.set_cksum();
        (header, body.to_vec())
    }

    fn archive_of(entries: Vec<(Header, Vec<u8>)>) -> Vec<u8> {
        let mut builder = Builder::new(GzEncoder::new(Vec::new(), Compression::fast()));
        for (header, body) in entries {
            builder.append(&header, body.as_slice()).unwrap();
        }
        builder.into_inner().unwrap().finish().unwrap()
    }

    fn found_under(dir: &Path) -> Vec<String> {
        let mut found = Vec::new();
        let mut pending = vec![dir.to_path_buf()];
        while let Some(at) = pending.pop() {
            for item in std::fs::read_dir(at).unwrap() {
                let item = item.unwrap();
                if item.file_type().unwrap().is_dir() {
                    pending.push(item.path());
                } else {
                    let relative = item.path().strip_prefix(dir).unwrap().to_owned();
                    found.push(relative.to_string_lossy().into_owned());
                }
            }
        }
        found.sort();
        found
    }

    #[test]
    fn a_file_lands_under_its_path_with_its_bytes() {
        let dir = tmpdir("unpack-file");
        let archive = archive_of(vec![entry("a/b/c.yml", EntryType::Regular, b"body")]);

        unpack(&archive, dir.path()).unwrap();

        assert_eq!(
            std::fs::read(dir.path().join("a/b/c.yml")).unwrap(),
            b"body"
        );
    }

    #[test]
    fn a_directory_entry_becomes_a_folder() {
        let dir = tmpdir("unpack-dir");
        let archive = archive_of(vec![entry("a/empty/", EntryType::Directory, b"")]);

        unpack(&archive, dir.path()).unwrap();

        assert!(dir.path().join("a/empty").is_dir());
    }

    #[test]
    fn the_global_header_github_writes_first_is_not_unpacked_as_a_file() {
        let dir = tmpdir("unpack-pax");
        let archive = archive_of(vec![
            entry(
                "pax_global_header",
                EntryType::XGlobalHeader,
                b"52 comment=abc\n",
            ),
            entry("Indexers-master/a.yml", EntryType::Regular, b"body"),
        ]);

        unpack(&archive, dir.path()).unwrap();

        assert_eq!(found_under(dir.path()), ["Indexers-master/a.yml"]);
    }

    #[test]
    fn a_path_that_climbs_out_of_the_folder_is_not_written() {
        let parent = tmpdir("unpack-climb");
        let dir = parent.path().join("inside");
        std::fs::create_dir(&dir).unwrap();
        let archive = archive_of(vec![
            entry("../outside.yml", EntryType::Regular, b"body"),
            entry("kept.yml", EntryType::Regular, b"body"),
        ]);

        unpack(&archive, &dir).unwrap();

        assert_eq!(found_under(parent.path()), ["inside/kept.yml"]);
    }

    #[test]
    fn a_link_in_the_archive_is_not_created() {
        let dir = tmpdir("unpack-link");
        let archive = archive_of(vec![
            entry("escape", EntryType::Symlink, b""),
            entry("hard", EntryType::Link, b""),
            entry("kept.yml", EntryType::Regular, b"body"),
        ]);

        unpack(&archive, dir.path()).unwrap();

        assert_eq!(found_under(dir.path()), ["kept.yml"]);
    }

    #[test]
    fn bytes_that_are_not_gzip_are_an_error() {
        let dir = tmpdir("unpack-garbage");

        let outcome = unpack(b"this is not a gzip stream", dir.path());

        assert!(outcome.is_err());
    }
}
