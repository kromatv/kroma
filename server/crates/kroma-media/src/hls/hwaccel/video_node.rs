use std::fs::OpenOptions;
use std::path::{Path, PathBuf};

pub(super) fn openable() -> Result<(), String> {
    openable_in(Path::new("/dev"))
}

fn openable_in(dev: &Path) -> Result<(), String> {
    let nodes = video_nodes(dev);
    if nodes.is_empty() {
        return Err(format!(
            "{} has no video device (in Docker, pass --device /dev/video11)",
            dev.display()
        ));
    }
    let opens = |node: &PathBuf| OpenOptions::new().read(true).write(true).open(node).is_ok();
    if nodes.iter().any(opens) {
        return Ok(());
    }
    Err(format!(
        "no video device in {} is readable by this user (the user must join the \
         `video` group; in Docker, add it with --group-add)",
        dev.display()
    ))
}

fn video_nodes(dev: &Path) -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(dev) else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter(|entry| entry.file_name().to_string_lossy().starts_with("video"))
        .map(|entry| entry.path())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_host_with_no_video_device_says_which_one_to_pass_in() {
        let dev = tempfile::tempdir().unwrap();
        std::fs::write(dev.path().join("null"), b"").unwrap();

        let why = openable_in(dev.path()).unwrap_err();

        assert!(why.contains("--device /dev/video11"), "{why}");
    }

    #[test]
    fn a_video_device_nobody_here_can_open_names_the_group() {
        let dev = tempfile::tempdir().unwrap();
        std::fs::create_dir(dev.path().join("video11")).unwrap();

        let why = openable_in(dev.path()).unwrap_err();

        assert!(why.contains("`video` group"), "{why}");
    }

    #[test]
    fn one_video_device_that_opens_is_enough() {
        let dev = tempfile::tempdir().unwrap();
        std::fs::create_dir(dev.path().join("video10")).unwrap();
        std::fs::write(dev.path().join("video11"), b"").unwrap();

        assert_eq!(openable_in(dev.path()), Ok(()));
    }

    #[test]
    fn a_dev_directory_that_cannot_be_listed_has_no_video_device() {
        let dev = tempfile::tempdir().unwrap();

        let why = openable_in(&dev.path().join("missing")).unwrap_err();

        assert!(why.contains("has no video device"), "{why}");
    }
}
