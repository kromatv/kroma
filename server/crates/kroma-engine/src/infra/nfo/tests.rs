use std::io::Write;

use super::*;

const HEAT: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<movie>
    <title>Heat</title>
    <originaltitle>Heat</originaltitle>
    <sorttitle>Heat (1995)</sorttitle>
    <tagline> A Los Angeles crime saga </tagline>
    <plot>A thief &amp; a detective. <![CDATA[Two men.]]></plot>
    <premiered>1995-12-15</premiered>
    <year>1990</year>
    <genre>Crime</genre>
    <genre>Drama</genre>
    <uniqueid type="imdb">tt0113277</uniqueid>
    <uniqueid type="tmdb" default="true">949</uniqueid>
    <actor><name>Al Pacino</name><role>Vincent</role></actor>
    <set><name>Collection</name></set>
</movie>"#;

#[test]
fn a_film_s_file_gives_its_names_tagline_summary_release_date_genres_and_ids() {
    let Contents {
        edit,
        tmdb,
        elsewhere,
    } = parsed(HEAT, MOVIE);

    assert_eq!(edit.title.as_deref(), Some("Heat"));
    assert_eq!(edit.sort_title.as_deref(), Some("Heat (1995)"));
    assert_eq!(edit.tagline.as_deref(), Some("A Los Angeles crime saga"));
    assert_eq!(
        edit.overview.as_deref(),
        Some("A thief & a detective. Two men.")
    );
    assert_eq!(edit.year, Some(1995));
    assert_eq!(edit.released.as_deref(), Some("1995-12-15"));
    assert_eq!(edit.genres, Some(vec!["Crime".into(), "Drama".into()]));
    assert_eq!(tmdb, Some(949));
    assert_eq!(elsewhere.imdb.as_deref(), Some("tt0113277"));
    assert_eq!(elsewhere.tvdb, None);
}

#[test]
fn a_file_gives_the_title_in_the_language_it_was_made_in() {
    let text = "<movie><title>Spirited Away</title>\
        <originaltitle> Sen to Chihiro no kamikakushi </originaltitle></movie>";

    let Contents { edit, .. } = parsed(text, MOVIE);

    assert_eq!(edit.title.as_deref(), Some("Spirited Away"));
    assert_eq!(
        edit.original_title.as_deref(),
        Some("Sen to Chihiro no kamikakushi")
    );
}

#[test]
fn the_year_alone_is_read_when_the_file_has_no_premiere() {
    let text = "<tvshow><title> Our show </title><year>2004</year><genre> </genre></tvshow>";

    let edit = parsed(text, TVSHOW).edit;

    assert_eq!(edit.title.as_deref(), Some("Our show"));
    assert_eq!(edit.year, Some(2004));
    assert_eq!(edit.released, None);
    assert_eq!(edit.genres, None);
    assert_eq!(edit.overview, None);
}

#[test]
fn a_premiere_that_is_no_day_gives_its_year_and_no_date() {
    let text = "<movie><premiered>1995</premiered><year>1990</year></movie>";

    let edit = parsed(text, MOVIE).edit;

    assert_eq!(edit.year, Some(1995));
    assert_eq!(edit.released, None);
}

#[test]
fn a_link_after_the_document_names_the_tmdb_id_the_document_does_not() {
    let text =
        "\u{feff}<movie><title>Heat</title></movie>\nhttps://www.themoviedb.org/movie/949-heat";

    let contents = parsed(text, MOVIE);

    assert_eq!(contents.edit.title.as_deref(), Some("Heat"));
    assert_eq!(contents.tmdb, Some(949));
}

#[test]
fn a_link_alone_names_the_tmdb_id_of_its_kind_of_title() {
    let film = "https://www.themoviedb.org/movie/949";
    let show = "https://www.themoviedb.org/tv/1438-the-wire\n";

    assert_eq!(parsed(film, MOVIE).tmdb, Some(949));
    assert_eq!(parsed(show, TVSHOW).tmdb, Some(1438));
    assert_eq!(parsed(film, TVSHOW).tmdb, None);
}

#[test]
fn a_link_to_imdb_names_the_imdb_id_of_a_film_or_a_show() {
    let film = "https://www.imdb.com/title/tt0113277/";
    let show = "<tvshow><title>The Wire</title></tvshow>\nhttps://imdb.com/title/tt0306414";

    assert_eq!(
        parsed(film, MOVIE).elsewhere.imdb.as_deref(),
        Some("tt0113277")
    );
    assert_eq!(
        parsed(show, TVSHOW).elsewhere.imdb.as_deref(),
        Some("tt0306414")
    );
    assert_eq!(parsed(film, MOVIE).tmdb, None);
    assert_eq!(
        parsed("https://www.imdb.com/name/nm0000199/", MOVIE),
        Contents::default()
    );
}

#[test]
fn the_tmdb_id_jellyfin_writes_on_its_own_tag_is_read() {
    let text = r#"<tvshow><uniqueid type="Tvdb">79126</uniqueid><tmdbid>1438</tmdbid></tvshow>"#;
    let unnamed = r#"<movie><uniqueid type="tmdb">0</uniqueid><tmdbid>x</tmdbid></movie>"#;

    assert_eq!(parsed(text, TVSHOW).tmdb, Some(1438));
    assert_eq!(parsed(text, TVSHOW).elsewhere.tvdb, Some(79126));
    assert_eq!(parsed(unnamed, MOVIE).tmdb, None);
}

#[test]
fn the_imdb_and_tvdb_ids_jellyfin_writes_on_their_own_tags_are_read() {
    let text = "<tvshow><imdbid>tt0306414</imdbid><tvdbid>79126</tvdbid></tvshow>";
    let unnamed = r#"<movie><uniqueid type="imdb">0113277</uniqueid><imdbid>tt12</imdbid>
                     <tvdbid>-4</tvdbid></movie>"#;

    let named = parsed(text, TVSHOW).elsewhere;

    assert_eq!(named.imdb.as_deref(), Some("tt0306414"));
    assert_eq!(named.tvdb, Some(79126));
    assert_eq!(parsed(unnamed, MOVIE).elsewhere, Elsewhere::default());
}

#[test]
fn a_file_for_another_kind_of_title_gives_nothing() {
    let episode = "<episodedetails><title>Pilot</title></episodedetails>";
    let nested = "<tvshow><movie><title>Heat</title></movie></tvshow>";
    let entity = r#"<!DOCTYPE movie [<!ENTITY a "x">]><movie><title>&a;</title></movie>"#;

    assert_eq!(parsed(episode, MOVIE), Contents::default());
    assert_eq!(parsed(nested, MOVIE), Contents::default());
    assert_eq!(parsed(entity, MOVIE), Contents::default());
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

    assert_eq!(read(&small, &[MOVIE]).edit.title.as_deref(), Some("Heat"));
    assert!(modified(&small).is_some());
    assert_eq!(read(&large, &[MOVIE]), Contents::default());
    assert_eq!(read(&latin, &[MOVIE]), Contents::default());
    assert_eq!(
        read(&dir.path().join("missing.nfo"), &[MOVIE]),
        Contents::default()
    );
    assert_eq!(modified(&dir.path().join("missing.nfo")), None);
}

const PILOT: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<episodedetails>
    <title>Pilot</title>
    <season>1</season>
    <episode>1</episode>
    <plot>A teacher learns he is ill.</plot>
    <aired>2008-01-20</aired>
    <uniqueid type="tmdb" default="true">62085</uniqueid>
</episodedetails>
<episodedetails>
    <title>Cat's in the Bag</title>
    <episode>2</episode>
</episodedetails>
https://www.themoviedb.org/movie/949"#;

#[test]
fn an_episode_s_file_gives_its_first_episode_s_name_summary_and_air_date() {
    let Contents {
        edit,
        tmdb,
        elsewhere,
    } = parsed(PILOT, EPISODE);

    assert_eq!(edit.title.as_deref(), Some("Pilot"));
    assert_eq!(
        edit.overview.as_deref(),
        Some("A teacher learns he is ill.")
    );
    assert_eq!(edit.released.as_deref(), Some("2008-01-20"));
    assert_eq!(edit.year, Some(2008));
    assert_eq!(edit.genres, None);
    assert_eq!(tmdb, None);
    assert_eq!(elsewhere, Elsewhere::default());
}

#[test]
fn a_file_read_for_a_film_or_an_episode_takes_the_root_it_holds() {
    let dir = kroma_testing::temp_dir("nfo");
    let path = dir.path().join("Breaking Bad - S01E01.nfo");
    std::fs::write(&path, PILOT).unwrap();

    let contents = read(&path, &[MOVIE, EPISODE]);

    assert_eq!(contents.edit.title.as_deref(), Some("Pilot"));
    assert_eq!(contents.tmdb, None);
}
