use super::test_support::{metadata, put_image, scoped_dir};
use super::*;

fn read(path: &Path) -> String {
    std::fs::read_to_string(path).unwrap()
}

#[test]
fn localize_caches_every_remote_image_and_keeps_local_paths() {
    let dir = scoped_dir();
    let meta = metadata(
        "https://img.example/poster.jpg",
        "/api/images/backdrop.webp",
        "https://img.example/logo.png",
        "https://img.example/face.jpg",
    );

    let out = localize(dir.path(), meta);

    let poster = out.poster_url.unwrap();
    assert!(poster.starts_with(PUBLIC_PREFIX) && poster.ends_with(".webp"));
    assert_eq!(out.backdrop_url.unwrap(), "/api/images/backdrop.webp");
    assert!(out.logo_url.unwrap().ends_with(".png"));
    assert!(out.cast[0]
        .profile_url
        .as_deref()
        .unwrap()
        .ends_with(".webp"));
}

#[test]
fn localize_leaves_an_image_that_cannot_be_downloaded_untouched() {
    let dir = scoped_dir();
    let meta = metadata(
        "https://img.example/bad.jpg",
        "https://img.example/bad2.jpg",
        "https://img.example/bad3.png",
        "https://img.example/bad4.jpg",
    );

    let out = localize(dir.path(), meta);

    assert_eq!(out.poster_url.unwrap(), "https://img.example/bad.jpg");
    assert_eq!(out.logo_url.unwrap(), "https://img.example/bad3.png");
    assert_eq!(
        out.cast[0].profile_url.as_deref().unwrap(),
        "https://img.example/bad4.jpg"
    );
}

#[test]
fn localize_title_art_keeps_poster_and_logo_and_drops_what_failed() {
    let dir = scoped_dir();
    let good = metadata(
        "https://img.example/p.jpg",
        "x",
        "https://img.example/l.png",
        "y",
    );
    let bad = metadata(
        "https://img.example/bad.jpg",
        "x",
        "https://img.example/bad.png",
        "y",
    );

    let cached = localize_title_art(dir.path(), good);
    let dropped = localize_title_art(dir.path(), bad);

    assert!(cached.poster_url.unwrap().ends_with(".webp"));
    assert!(cached.logo_url.unwrap().ends_with(".png"));
    assert!(dropped.poster_url.is_none());
    assert!(dropped.logo_url.is_none());
}

#[test]
fn cache_remote_passes_local_paths_through_and_fails_on_a_bad_download() {
    let dir = scoped_dir();

    let local = cache_remote(dir.path(), "/api/images/a.webp");
    let again = cache_remote(dir.path(), "https://img.example/a.jpg");
    let repeat = cache_remote(dir.path(), "https://img.example/a.jpg");
    let bad = cache_remote(dir.path(), "https://img.example/bad.jpg");

    assert_eq!(local.unwrap(), "/api/images/a.webp");
    assert_eq!(again, repeat);
    assert!(bad.is_none());
}

#[test]
fn card_renditions_are_cut_once_at_both_scales() {
    let dir = scoped_dir();
    put_image(dir.path(), "a.webp", "x");
    put_image(dir.path(), "a.logo.png", "x");

    let logo = card_logo_png(dir.path(), "a.webp", 1).unwrap();
    let logo_2x = card_logo_png(dir.path(), "a.webp", 2).unwrap();
    let base = card_base_png(dir.path(), "a.webp", 1).unwrap();
    let base_2x = card_base_png(dir.path(), "a.webp", 2).unwrap();
    let jpeg = jpeg_rendition(dir.path(), "a.webp").unwrap();
    let cached = card_base_png(dir.path(), "a.webp", 1).unwrap();

    assert!(read(&logo).contains("scale=300:120"));
    assert!(read(&logo_2x).contains("scale=600:240"));
    assert!(read(&base).contains("scale=640:360"));
    assert!(read(&base_2x).contains("crop=1280:720"));
    assert!(read(&jpeg).contains("-q:v 3"));
    assert_eq!(cached, base);
}

#[test]
fn a_rendition_of_a_missing_or_undecodable_source_is_none() {
    let dir = scoped_dir();
    put_image(dir.path(), "ffmpeg-fails.webp", "x");

    let missing = jpeg_rendition(dir.path(), "gone.webp");
    let broken = jpeg_rendition(dir.path(), "ffmpeg-fails.webp");

    assert!(missing.is_none());
    assert!(broken.is_none());
}

#[test]
fn a_sized_rendition_is_a_webp_for_a_wider_master() {
    let dir = scoped_dir();
    put_image(dir.path(), "wide.webp", "900");

    let (path, mime) = sized_rendition(dir.path(), "wide.webp", 400).unwrap();
    let (again, again_mime) = sized_rendition(dir.path(), "wide.webp", 400).unwrap();

    assert_eq!(mime, "image/webp");
    assert!(read(&path).contains("-resize 400 0"));
    assert_eq!((again, again_mime), (path, mime));
}

#[test]
fn a_sized_rendition_is_none_for_a_missing_or_narrower_master() {
    let dir = scoped_dir();
    put_image(dir.path(), "narrow.webp", "300");

    let missing = sized_rendition(dir.path(), "gone.webp", 400);
    let narrow = sized_rendition(dir.path(), "narrow.webp", 400);

    assert!(missing.is_none());
    assert!(narrow.is_none());
}

#[test]
fn a_sized_rendition_falls_back_to_jpeg_when_cwebp_fails() {
    let dir = scoped_dir();
    put_image(dir.path(), "cwebp-fails.webp", "900");

    let (path, mime) = sized_rendition(dir.path(), "cwebp-fails.webp", 400).unwrap();
    let (again, again_mime) = sized_rendition(dir.path(), "cwebp-fails.webp", 400).unwrap();

    assert_eq!(mime, "image/jpeg");
    assert!(read(&path).contains("min(iw,400)"));
    assert_eq!((again, again_mime), (path, mime));
}

#[test]
fn a_sized_rendition_is_none_when_both_encoders_fail() {
    let dir = scoped_dir();
    put_image(dir.path(), "cwebp-fails-ffmpeg-fails.webp", "900");

    let sized = sized_rendition(dir.path(), "cwebp-fails-ffmpeg-fails.webp", 400);

    assert!(sized.is_none());
}

#[test]
fn an_upload_is_stored_once_under_a_content_addressed_name() {
    let dir = scoped_dir();

    let first = store_upload(dir.path(), b"abc", None, "up-").unwrap();
    let second = store_upload(dir.path(), b"abc", None, "up-").unwrap();
    let other = store_upload(dir.path(), b"abd", None, "up-").unwrap();

    assert_eq!(first, second);
    assert_ne!(first, other);
    assert!(first.starts_with("/api/images/up-") && first.ends_with(".webp"));
}

#[test]
fn an_upload_is_resized_only_when_it_exceeds_the_cap() {
    let dir = scoped_dir();

    let wide = store_upload(dir.path(), b"2000", Some(1280), "").unwrap();
    let narrow = store_upload(dir.path(), b"320", Some(1280), "").unwrap();
    let unknown = store_upload(dir.path(), b"not a number", Some(1280), "").unwrap();

    let stored =
        |url: &str| read(&images_dir(dir.path()).join(url.trim_start_matches(PUBLIC_PREFIX)));
    assert!(wide.contains("-w1280"));
    assert!(stored(&wide).contains("-resize 1280 0"));
    assert!(!stored(&narrow).contains("-resize"));
    assert!(!stored(&unknown).contains("-resize"));
}

#[test]
fn an_upload_falls_back_to_ffmpeg_when_cwebp_fails() {
    let dir = scoped_dir();

    let shrunk = store_upload(dir.path(), b"2000", Some(1280), "cwebp-fails-").unwrap();
    let plain = store_upload(dir.path(), b"2000", None, "cwebp-fails-").unwrap();

    let stored =
        |url: &str| read(&images_dir(dir.path()).join(url.trim_start_matches(PUBLIC_PREFIX)));
    assert!(stored(&shrunk).contains("min(iw,1280)"));
    assert!(stored(&plain).contains("libwebp"));
}

#[test]
fn an_upload_neither_encoder_can_read_is_not_stored() {
    let dir = scoped_dir();

    let capped = store_upload(dir.path(), b"1", Some(1280), "cwebp-fails-ffmpeg-fails-");
    let plain = store_upload(dir.path(), b"1", None, "cwebp-fails-ffmpeg-fails-");

    assert!(capped.is_none());
    assert!(plain.is_none());
}

#[test]
fn an_upload_into_an_unwritable_image_dir_is_none() {
    let dir = scoped_dir();
    std::fs::write(images_dir(dir.path()), b"a file, not a directory").unwrap();

    let stored = store_upload(dir.path(), b"abc", None, "");
    let cached = cache_remote(dir.path(), "https://img.example/a.jpg");

    assert!(stored.is_none());
    assert!(cached.is_none());
}
