use std::fs::File;
use std::io::{self, Read, Seek, SeekFrom};
use std::os::unix::fs::{MetadataExt, OpenOptionsExt};
use std::path::Path;

use anyhow::{ensure, Context};

use super::is_database_name;
use crate::private_folder::private_folder;

const HEADER: &[u8; 16] = b"SQLite format 3\0";
const CARRIED: [&str; 2] = ["-wal", "-journal"];

pub(super) fn copy_databases(own: &Path, moving: &Path) -> anyhow::Result<Vec<String>> {
    private_folder(moving).with_context(|| format!("create {}", moving.display()))?;
    let entries = match std::fs::read_dir(own) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error).with_context(|| format!("read {}", own.display())),
    };
    let mut names = Vec::new();
    for entry in entries {
        let entry = entry?;
        let Some(name) = entry.file_name().to_str().map(str::to_string) else {
            continue;
        };
        if !is_database_name(&name) {
            continue;
        }
        let database = own.join(&name);
        let Some(mut source) = only_name(&database)? else {
            continue;
        };
        if !is_database(&mut source)? {
            continue;
        }
        let copy = moving.join(&name);
        carry(source, &copy)?;
        for suffix in CARRIED {
            if let Some(journal) = only_name(&kroma_sqlite::journal_of(&database, suffix))? {
                carry(journal, &kroma_sqlite::journal_of(&copy, suffix))?;
            }
        }
        settle(&copy)?;
        names.push(name);
    }
    Ok(names)
}

fn only_name(path: &Path) -> anyhow::Result<Option<File>> {
    let regular = |meta: &std::fs::Metadata| meta.file_type().is_file() && meta.nlink() == 1;
    if !std::fs::symlink_metadata(path).is_ok_and(|meta| regular(&meta)) {
        return Ok(None);
    }
    let file = std::fs::OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK)
        .open(path)
        .with_context(|| format!("open {}", path.display()))?;
    Ok(regular(&file.metadata()?).then_some(file))
}

fn is_database(file: &mut File) -> anyhow::Result<bool> {
    let mut header = [0; HEADER.len()];
    match file.read_exact(&mut header) {
        Ok(()) => Ok(&header == HEADER),
        Err(error) if error.kind() == io::ErrorKind::UnexpectedEof => Ok(false),
        Err(error) => Err(error.into()),
    }
}

fn carry(mut source: File, to: &Path) -> anyhow::Result<()> {
    let expected = source.metadata()?.len();
    source.seek(SeekFrom::Start(0))?;
    let mut copy = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(to)
        .with_context(|| format!("create {}", to.display()))?;
    let copied = io::copy(&mut source, &mut copy)?;
    ensure!(copied == expected, "{} changed while it was copied", to.display());
    copy.sync_all()?;
    Ok(())
}

fn settle(copy: &Path) -> anyhow::Result<()> {
    let conn = kroma_sqlite::open_owned(copy)?;
    conn.query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |_| Ok(()))?;
    let verdict: String = conn.query_row("PRAGMA quick_check", [], |row| row.get(0))?;
    ensure!(verdict == "ok", "{} does not read back whole: {verdict}", copy.display());
    Ok(())
}
