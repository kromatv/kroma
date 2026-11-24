use std::path::Path;

use super::super::test_support::scoped_dir;
use super::*;

fn picture(dir: &Path, name: &str, contents: &str) -> PathBuf {
    let path = dir.join("media").join(name);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(&path, contents).unwrap();
    path
}

#[test]
fn a_picture_is_encoded_once_and_again_once_it_changes() {
    let dir = scoped_dir();
    let poster = picture(dir.path(), "poster.jpg", "2000");

    let first = cache_picture_beside(dir.path(), &poster, 780).unwrap();
    let again = cache_picture_beside(dir.path(), &poster, 780).unwrap();
    std::fs::write(&poster, "320 wide").unwrap();
    let edited = cache_picture_beside(dir.path(), &poster, 780).unwrap();

    assert_eq!(first, again);
    assert_ne!(first, edited);
    assert!(std::fs::read_to_string(&first)
        .unwrap()
        .contains("-resize 780 0"));
    assert!(first.starts_with(images_dir(dir.path())));
}

#[test]
fn a_picture_that_is_gone_or_unreadable_is_not_cached() {
    let dir = scoped_dir();
    let broken = picture(dir.path(), "cwebp-fails-ffmpeg-fails-poster.jpg", "1");

    let unreadable = cache_picture_beside(dir.path(), &broken, 780);
    let gone = cache_picture_beside(dir.path(), &dir.path().join("media/none.jpg"), 780);

    assert!(unreadable.is_none());
    assert!(gone.is_none());
    assert_eq!(
        std::fs::read_dir(images_dir(dir.path())).unwrap().count(),
        0
    );
}
