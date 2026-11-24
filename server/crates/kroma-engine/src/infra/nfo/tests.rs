use std::io::Write;

use super::*;

const HEAT: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<movie>
    <title>Heat</title>
    <originaltitle>Heat</originaltitle>
    <plot>A thief &amp; a detective. <![CDATA[Two men.]]></plot>
    <premiered>1995-12-15</premiered>
    <year>1990</year>
    <genre>Crime</genre>
    <genre>Drama</genre>
    <actor><name>Al Pacino</name><role>Vincent</role></actor>
    <set><name>Collection</name></set>
</movie>"#;

#[test]
fn a_film_s_file_gives_its_name_summary_year_and_genres() {
    let edit = parsed(HEAT, MOVIE).expect("a film's text");

    assert_eq!(edit.title.as_deref(), Some("Heat"));
    assert_eq!(
        edit.overview.as_deref(),
        Some("A thief & a detective. Two men.")
    );
    assert_eq!(edit.year, Some(1995));
    assert_eq!(edit.genres, Some(vec!["Crime".into(), "Drama".into()]));
}

#[test]
fn the_year_alone_is_read_when_the_file_has_no_premiere() {
    let text = "<tvshow><title> Our show </title><year>2004</year><genre> </genre></tvshow>";

    let edit = parsed(text, TVSHOW).expect("a show's text");

    assert_eq!(edit.title.as_deref(), Some("Our show"));
    assert_eq!(edit.year, Some(2004));
    assert_eq!(edit.genres, None);
    assert_eq!(edit.overview, None);
}

#[test]
fn a_link_after_the_document_is_left_out() {
    let text = "\u{feff}<movie><title>Heat</title></movie>\nhttps://www.themoviedb.org/movie/949";

    let edit = parsed(text, MOVIE).expect("the text before the link");

    assert_eq!(edit.title.as_deref(), Some("Heat"));
}

#[test]
fn a_file_for_another_kind_of_title_gives_nothing() {
    let episode = "<episodedetails><title>Pilot</title></episodedetails>";
    let nested = "<tvshow><movie><title>Heat</title></movie></tvshow>";
    let link = "https://www.themoviedb.org/movie/949";
    let entity = r#"<!DOCTYPE movie [<!ENTITY a "x">]><movie><title>&a;</title></movie>"#;

    assert_eq!(parsed(episode, MOVIE), None);
    assert_eq!(parsed(nested, MOVIE), None);
    assert_eq!(parsed(link, MOVIE), None);
    assert_eq!(parsed(entity, MOVIE), None);
}

#[test]
fn a_file_on_disk_is_read_up_to_the_largest_size() {
    let dir = kroma_testing::temp_dir("nfo");
    let small = dir.path().join("Heat.nfo");
    std::fs::write(&small, HEAT).unwrap();
    let large = dir.path().join("Large.nfo");
    let mut file = File::create(&large).unwrap();
    file.write_all(b"<movie><title>Large</title><plot>")
        .unwrap();
    file.write_all(&vec![b'a'; 1 << 20]).unwrap();
    file.write_all(b"</plot></movie>").unwrap();
    let latin = dir.path().join("Latin.nfo");
    std::fs::write(&latin, b"<movie><title>Caf\xe9</title></movie>").unwrap();

    assert_eq!(read(&small, MOVIE).title.as_deref(), Some("Heat"));
    assert!(modified(&small).is_some());
    assert!(read(&large, MOVIE).is_empty());
    assert!(read(&latin, MOVIE).is_empty());
    assert!(read(&dir.path().join("missing.nfo"), MOVIE).is_empty());
    assert_eq!(modified(&dir.path().join("missing.nfo")), None);
}
