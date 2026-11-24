use super::super::*;
use super::walk;
use crate::test_support::test_state;

#[test]
fn a_walk_records_the_subtitle_file_beside_a_film_and_forgets_it_once_removed() {
    let state = test_state();
    let root = kroma_testing::temp_dir("live-subtitle-files");
    let subtitle = root.path().join("Heat (1995).en.srt");
    std::fs::write(root.path().join("Heat (1995).mkv"), b"x").unwrap();
    std::fs::write(&subtitle, b"x").unwrap();

    walk(&state, root.path());
    let found = db::subtitle_file_languages(&state.db).unwrap();
    std::fs::remove_file(&subtitle).unwrap();
    walk(&state, root.path());
    let after = db::subtitle_file_languages(&state.db).unwrap();

    assert_eq!(found.into_values().collect::<Vec<_>>(), [["en"]]);
    assert!(after.is_empty());
}
