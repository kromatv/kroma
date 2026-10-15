use std::fmt;

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct WatchedFile {
    pub download: String,
    pub file: usize,
}

impl WatchedFile {
    /// `None` for a download id that could not sit in a URL path segment as it
    /// is, which is also what keeps it out of a session directory name.
    pub fn new(download: String, file: usize) -> Option<Self> {
        let plain = !download.is_empty()
            && download
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.'));
        plain.then_some(Self { download, file })
    }
}

/// The id the HLS engine keys this file's sessions under.
impl fmt::Display for WatchedFile {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}:{}", self.download, self.file)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_download_id_that_would_need_escaping_in_a_path_is_refused() {
        let ids = ["22e86113ba9a6db4", "a/b", "a?b", ""];

        let accepted = ids.map(|id| WatchedFile::new(id.to_string(), 0).is_some());

        assert_eq!(accepted, [true, false, false, false]);
    }

    #[test]
    fn two_files_of_one_download_key_their_sessions_apart() {
        let watched = WatchedFile::new("d1".into(), 5).unwrap();
        let sibling = WatchedFile::new("d1".into(), 6).unwrap();

        assert_eq!(watched.to_string(), "d1:5");
        assert_ne!(watched.to_string(), sibling.to_string());
    }
}
