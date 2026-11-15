use super::*;
use crate::test_support::recording_server::RecordingServer;

const KEY: &str = "0123456789abcdef0123456789abcdef";
const POSTER: &str = "https://image.tmdb.org/t/p/w342/aBc123.jpg";

fn signature_of(path: &str) -> &str {
    path.split('/').nth(4).unwrap()
}

#[test]
fn a_provider_image_is_served_from_a_signed_path_on_this_server() {
    let path = served(KEY, POSTER).unwrap();

    let art = Art::parse("w342", "aBc123.jpg").unwrap();

    assert!(path.starts_with("/api/images/tmdb/"));
    assert!(path.ends_with("/w342/aBc123.jpg"));
    assert!(art.signed_by(KEY, signature_of(&path)));
}

#[test]
fn a_signature_answers_for_one_image_at_one_size_under_one_key() {
    let path = served(KEY, POSTER).unwrap();
    let signature = signature_of(&path);

    let other_file = Art::parse("w342", "zZz999.jpg").unwrap();
    let other_size = Art::parse("w780", "aBc123.jpg").unwrap();
    let same = Art::parse("w342", "aBc123.jpg").unwrap();

    assert!(!other_file.signed_by(KEY, signature));
    assert!(!other_size.signed_by(KEY, signature));
    assert!(!same.signed_by("another key", signature));
    assert!(!same.signed_by(KEY, ""));
}

#[test]
fn only_a_rendition_and_a_plain_file_name_make_an_image() {
    for (size, file) in [
        ("w342", "../secret.jpg"),
        ("w342", "a/b.jpg"),
        ("w342", "poster"),
        ("w342", ".jpg"),
        ("w342", "poster.exe"),
        ("..", "poster.jpg"),
        ("w3", "poster.jpg"),
        ("wide", "poster.jpg"),
        ("w34200", "poster.jpg"),
    ] {
        assert_eq!(Art::parse(size, file), None, "{size}/{file}");
    }
    assert!(Art::parse("original", "poster.png").is_some());
    assert!(Art::parse("h632", "face.jpg").is_some());
}

#[test]
fn an_address_that_is_not_a_provider_image_is_not_served() {
    for url in [
        "https://example.org/t/p/w342/a.jpg",
        "https://image.tmdb.org/t/p/w342/a.jpg?x=1",
        "https://image.tmdb.org/t/p/w342",
        "/api/images/feed.webp",
    ] {
        assert_eq!(served(KEY, url), None, "{url}");
    }
}

#[test]
fn every_provider_image_in_a_document_is_replaced_and_nothing_else_moves() {
    let document = r#"{"posterUrl":"https://image.tmdb.org/t/p/w342/a1.jpg","title":"A \"quoted\" title","backdropUrl":"https://image.tmdb.org/t/p/w1280/b2.jpg","site":"https://example.org/x.jpg"}"#;

    let rewritten = rewrite(KEY, document).unwrap();

    let poster = served(KEY, "https://image.tmdb.org/t/p/w342/a1.jpg").unwrap();
    let backdrop = served(KEY, "https://image.tmdb.org/t/p/w1280/b2.jpg").unwrap();
    assert_eq!(
        rewritten,
        format!(
            r#"{{"posterUrl":"{poster}","title":"A \"quoted\" title","backdropUrl":"{backdrop}","site":"https://example.org/x.jpg"}}"#
        )
    );
    assert!(!rewritten.contains("image.tmdb.org"));
}

#[test]
fn a_document_that_names_no_provider_image_is_left_alone() {
    assert_eq!(rewrite(KEY, r#"{"posterUrl":"/api/images/feed.webp"}"#), None);
}

#[test]
fn a_provider_address_that_is_not_an_image_stays_as_it_was() {
    let document = r#"{"note":"https://image.tmdb.org/t/p/ is the base"}"#;

    assert_eq!(rewrite(KEY, document).as_deref(), Some(document));
}

#[test]
fn an_image_is_downloaded_once_and_then_read_from_disk() {
    let dir = kroma_testing::temp_dir("remote-art-fetch");
    let provider = RecordingServer::replying(200, "the poster");
    let base = format!("{}/t/p/", provider.base());
    let art = Art::parse("w342", "aBc123.jpg").unwrap();

    let first = fetch(dir.path(), &base, art).unwrap();
    let second = fetch(dir.path(), &base, art).unwrap();

    assert_eq!(std::fs::read_to_string(&first).unwrap(), "the poster");
    assert_eq!(first, second);
    assert_eq!(provider.requests().len(), 1);
    assert_eq!(provider.requests()[0].target, "/t/p/w342/aBc123.jpg");
}

#[test]
fn an_image_the_provider_does_not_have_leaves_nothing_on_disk() {
    let dir = kroma_testing::temp_dir("remote-art-missing");
    let provider = RecordingServer::replying(404, "not found");
    let base = format!("{}/t/p/", provider.base());
    let art = Art::parse("w342", "gone.jpg").unwrap();

    let fetched = fetch(dir.path(), &base, art);

    assert_eq!(fetched, None);
    let left = std::fs::read_dir(images_dir(dir.path()).join(FOLDER))
        .map(Iterator::count)
        .unwrap_or(0);
    assert_eq!(left, 0);
}
