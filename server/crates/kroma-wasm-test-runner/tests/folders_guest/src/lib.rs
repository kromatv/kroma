#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    fn module_root() -> PathBuf {
        let crate_dir =
            PathBuf::from(std::env::var_os("CARGO_MANIFEST_DIR").expect("cargo names the crate"));
        crate_dir
            .parent()
            .expect("a crate inside its module")
            .to_path_buf()
    }

    #[test]
    fn a_folder_behind_an_absolute_symlink_lists_its_files() {
        let through_the_link = module_root().join("through-link");

        let listed = std::fs::read_dir(&through_the_link).map(Iterator::count);

        assert_eq!(listed.map_err(|error| error.kind()), Ok(1));
    }

    #[test]
    fn the_scratch_dir_keeps_what_a_test_writes() {
        let scratch = PathBuf::from(std::env::var_os("TMPDIR").expect("a scratch dir"));
        let written = scratch.join("written");

        std::fs::write(&written, b"kept").unwrap();

        assert_eq!(std::fs::read(&written).unwrap(), b"kept");
    }
}
