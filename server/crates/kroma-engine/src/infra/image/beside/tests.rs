use std::path::{Path, PathBuf};

use super::super::images_dir;
use super::super::test_support::scoped_dir;
use super::*;

fn picture(dir: &Path, name: &str, contents: &str) -> PathBuf {
    let path = dir.join("media").join(name);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(&path, contents).unwrap();
    path
}

#[test]
fn a_picture_keeps_its_name_until_it_changes() {
    let dir = scoped_dir();
    let poster = picture(dir.path(), "poster.jpg", "2000");

    let first = beside_name(&poster).unwrap();
    let again = beside_name(&poster).unwrap();
    std::fs::write(&poster, "320 wide").unwrap();
    let edited = beside_name(&poster).unwrap();

    assert_eq!(first, again);
    assert_ne!(first, edited);
    assert!(first.starts_with(BESIDE_PREFIX));
    assert_eq!(beside_name(&dir.path().join("media/none.jpg")), None);
}

#[test]
fn a_picture_is_encoded_once_under_the_name_it_is_asked_for() {
    let dir = scoped_dir();
    let poster = picture(dir.path(), "poster.jpg", "2000");
    let out = images_dir(dir.path()).join("beside-asked.webp");

    let made = cache_picture_beside(&poster, &out, 780);
    std::fs::write(&poster, "320 wide").unwrap();
    let kept = cache_picture_beside(&poster, &out, 780);

    assert!(made && kept);
    assert!(std::fs::read_to_string(&out)
        .unwrap()
        .contains("-resize 780 0"));
}

#[test]
fn a_picture_that_is_gone_or_unreadable_is_not_cached() {
    let dir = scoped_dir();
    let broken = picture(dir.path(), "cwebp-fails-ffmpeg-fails-poster.jpg", "1");
    let out = images_dir(dir.path()).join("beside-broken.webp");

    let unreadable = cache_picture_beside(&broken, &out, 780);
    let gone = cache_picture_beside(&dir.path().join("media/none.jpg"), &out, 780);

    assert!(!unreadable && !gone);
    assert_eq!(
        std::fs::read_dir(images_dir(dir.path())).unwrap().count(),
        0
    );
}
