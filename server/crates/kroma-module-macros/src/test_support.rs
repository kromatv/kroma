use std::path::PathBuf;

pub(crate) struct Scratch(kroma_testing::TempDir);

impl Scratch {
    pub(crate) fn new(tag: &str) -> Self {
        let scratch = Self(kroma_testing::temp_dir(tag));
        std::fs::create_dir_all(scratch.0.path().join("server")).expect("scratch dir");
        scratch
    }

    pub(crate) fn write(&self, name: &str, bytes: &[u8]) {
        std::fs::write(self.0.path().join(name), bytes).expect("write");
    }

    pub(crate) fn write_locale(&self, name: &str, bytes: &[u8]) {
        let path = self.locale(name);
        std::fs::create_dir_all(path.parent().expect("a file under locales")).expect("locales dir");
        std::fs::write(path, bytes).expect("write");
    }

    pub(crate) fn locale(&self, name: &str) -> PathBuf {
        self.0.path().join("locales").join(name)
    }

    pub(crate) fn included(&self, code: &str, name: &str) -> String {
        format!(
            "({code:?}, include_str!({:?}))",
            self.locale(name).to_string_lossy()
        )
    }

    pub(crate) fn expand(&self) -> String {
        crate::expansion(Some(self.server_dir()))
    }

    pub(crate) fn expand_locales(&self) -> String {
        crate::locales::expansion(Some(self.server_dir()))
    }

    pub(crate) fn server_dir(&self) -> String {
        self.0.path().join("server").to_string_lossy().to_string()
    }
}
