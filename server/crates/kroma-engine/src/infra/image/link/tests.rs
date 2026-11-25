use super::*;
use crate::infra::image::test_server::{answer, serve};
use crate::infra::reach::test_reach::refuse_private;

#[test]
fn the_picture_a_link_serves_is_fetched() {
    let base = serve(|_| vec![answer("200 OK", "", b"picture")]);

    let fetched = fetch_link(&format!("{base}/poster.png"));

    assert_eq!(fetched.as_deref(), Some(&b"picture"[..]));
}

#[test]
fn a_link_that_moved_is_followed_to_its_picture() {
    let base = serve(|base| {
        vec![
            answer("302 Found", &format!("Location: {base}/moved.png\r\n"), b""),
            answer("200 OK", "", b"moved"),
        ]
    });

    let fetched = fetch_link(&format!("{base}/poster.png"));

    assert_eq!(fetched.as_deref(), Some(&b"moved"[..]));
}

#[test]
fn a_link_that_serves_no_picture_gives_nothing() {
    let missing = serve(|_| vec![answer("404 Not Found", "", b"gone")]);
    let empty = serve(|_| vec![answer("200 OK", "", b"")]);
    let elsewhere = serve(|_| {
        vec![answer(
            "302 Found",
            "Location: ftp://files.example/p.png\r\n",
            b"",
        )]
    });

    assert_eq!(fetch_link(&format!("{missing}/poster.png")), None);
    assert_eq!(fetch_link(&format!("{empty}/poster.png")), None);
    assert_eq!(fetch_link(&format!("{elsewhere}/poster.png")), None);
    assert_eq!(fetch_link("file:///etc/passwd"), None);
    assert_eq!(fetch_link("https://user@images.example/p.png"), None);
}

#[test]
fn a_link_that_keeps_moving_gives_nothing() {
    let base = serve(|base| {
        let again = answer("302 Found", &format!("Location: {base}/again.png\r\n"), b"");
        vec![again; HOPS + 1]
    });

    assert_eq!(fetch_link(&format!("{base}/poster.png")), None);
}

#[test]
fn a_link_to_the_servers_own_network_is_never_fetched() {
    refuse_private();
    let base = serve(|_| vec![answer("200 OK", "", b"private")]);

    assert_eq!(fetch_link(&format!("{base}/poster.png")), None);
}
