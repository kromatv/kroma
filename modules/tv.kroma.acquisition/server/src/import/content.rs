//! Which files on disk one download is. An external client saves every torrent
//! into one shared folder, so the engine's own file list decides, and walking
//! the save path is the fallback for a row recorded before engines reported it.

use std::path::{Path, PathBuf};

// How far under a download folder a release may bury its files before the
// import stops looking.
const DEEPEST_RELEASE: usize = 6;

pub(super) struct Content {
    files: Vec<PathBuf>,
}

impl Content {
    pub(super) fn under(save_path: &Path, named: &[String]) -> Self {
        let found = resolve(save_path, named);
        let files = if found.is_empty() {
            files_under(save_path)
        } else {
            found
        };
        Self { files }
    }

    pub(super) fn files(&self) -> &[PathBuf] {
        &self.files
    }

    pub(super) fn videos(&self) -> Vec<PathBuf> {
        self.files
            .iter()
            .filter(|path| {
                kroma_module_sdk::media::video::has_video_extension(path) && !is_a_sample(path)
            })
            .cloned()
            .collect()
    }
}

pub(super) fn largest(files: &[PathBuf]) -> Option<&Path> {
    files
        .iter()
        .max_by_key(|p| std::fs::metadata(p).map(|m| m.len()).unwrap_or(0))
        .map(PathBuf::as_path)
}

fn resolve(save_path: &Path, named: &[String]) -> Vec<PathBuf> {
    if named.is_empty() {
        return Vec::new();
    }
    let under = files_under(save_path);
    named
        .iter()
        .filter_map(|name| at(save_path, name).or_else(|| by_tail(&under, name)))
        .collect()
}

fn at(save_path: &Path, name: &str) -> Option<PathBuf> {
    let path = save_path.join(name);
    path.is_file().then_some(path)
}

// An engine reports a path relative to its own output folder, which is the save
// path for one and the torrent's folder under it for another.
fn by_tail(under: &[PathBuf], name: &str) -> Option<PathBuf> {
    let tail = Path::new(name);
    under.iter().find(|path| path.ends_with(tail)).cloned()
}

fn files_under(root: &Path) -> Vec<PathBuf> {
    walkdir::WalkDir::new(root)
        .max_depth(DEEPEST_RELEASE)
        .into_iter()
        .flatten()
        .filter(|entry| entry.file_type().is_file())
        .map(walkdir::DirEntry::into_path)
        .collect()
}

fn is_a_sample(path: &Path) -> bool {
    path.file_name()
        .and_then(std::ffi::OsStr::to_str)
        .unwrap_or_default()
        .to_ascii_lowercase()
        .contains("sample")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(path: &Path, body: &str) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, body).unwrap();
    }

    fn shared_folder(tag: &str) -> kroma_module_sdk::testing::TempDir {
        let scratch = kroma_module_sdk::testing::temp_dir(&format!("content-{tag}"));
        write(
            &scratch.path().join("Other.Film.2160p/Other.Film.2160p.mkv"),
            "xxxxxxxxxxxxxxxxxxxx",
        );
        write(
            &scratch.path().join("Wanted.S01E01/Wanted.S01E01.mkv"),
            "xx",
        );
        scratch
    }

    #[test]
    fn a_torrent_that_names_its_files_imports_none_of_its_neighbours() {
        let shared = shared_folder("named");

        let content = Content::under(
            shared.path(),
            &["Wanted.S01E01/Wanted.S01E01.mkv".to_string()],
        );

        assert_eq!(
            largest(&content.videos()),
            Some(
                shared
                    .path()
                    .join("Wanted.S01E01/Wanted.S01E01.mkv")
                    .as_path()
            )
        );
    }

    #[test]
    fn a_torrent_whose_engine_named_no_file_falls_back_to_the_whole_folder() {
        let shared = shared_folder("unnamed");

        let content = Content::under(shared.path(), &[]);

        assert_eq!(content.files().len(), 2);
        assert_eq!(
            largest(&content.videos()),
            Some(
                shared
                    .path()
                    .join("Other.Film.2160p/Other.Film.2160p.mkv")
                    .as_path()
            )
        );
    }

    #[test]
    fn a_file_the_engine_names_against_another_root_is_found_by_its_tail() {
        let shared = shared_folder("tail");

        let content = Content::under(shared.path(), &["Wanted.S01E01.mkv".to_string()]);

        assert_eq!(content.files().len(), 1);
        assert!(content.files()[0].ends_with("Wanted.S01E01/Wanted.S01E01.mkv"));
    }

    #[test]
    fn a_named_file_that_is_nowhere_is_dropped_rather_than_imported() {
        let shared = shared_folder("missing");

        let content = Content::under(
            shared.path(),
            &[
                "Wanted.S01E01/Wanted.S01E01.mkv".to_string(),
                "Wanted.S01E02/Wanted.S01E02.mkv".to_string(),
            ],
        );

        assert_eq!(content.files().len(), 1);
    }

    #[test]
    fn a_sample_is_never_the_video_a_release_is_imported_from() {
        let scratch = kroma_module_sdk::testing::temp_dir("content-sample");
        write(&scratch.path().join("sample.mkv"), "xxxxxxxxxxxx");
        write(&scratch.path().join("feature.mkv"), "xx");

        let content = Content::under(scratch.path(), &[]);

        assert_eq!(
            largest(&content.videos()),
            Some(scratch.path().join("feature.mkv").as_path())
        );
    }

    #[test]
    fn the_largest_of_no_video_file_is_nothing() {
        assert!(largest(&[]).is_none());
    }
}
