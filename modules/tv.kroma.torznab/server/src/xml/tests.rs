use super::*;

// Shape captured from a Jackett Torznab response: CDATA title, escaped
// entities in URLs, enclosure + torznab:attr extensions.
const RSS: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:torznab="http://torznab.com/schemas/2015/feed">
 <channel>
  <title>Indexer</title>
  <item>
   <title><![CDATA[The.Matrix.1999.1080p.BluRay.x265-GRP]]></title>
   <guid>https://tracker.example/details?id=42&amp;page=1</guid>
   <comments>https://tracker.example/torrent/42</comments>
   <link>https://jackett.local/dl/abc?path=x&amp;file=The.Matrix.torrent</link>
   <pubDate>Fri, 03 Jul 2026 10:11:12 +0000</pubDate>
   <size>8589934592</size>
   <enclosure url="https://jackett.local/dl/abc?path=x&amp;file=The.Matrix.torrent" length="8589934592" type="application/x-bittorrent" />
   <torznab:attr name="category" value="2000" />
   <torznab:attr name="seeders" value="12" />
   <torznab:attr name="peers" value="30" />
   <torznab:attr name="infohash" value="ABCDEF0123456789" />
   <torznab:attr name="magneturl" value="magnet:?xt=urn:btih:ABCDEF0123456789&amp;dn=The.Matrix" />
   <torznab:attr name="imdbid" value="tt0133093" />
   <torznab:attr name="tmdbid" value="603" />
  </item>
  <item>
   <title>Second Release 720p WEB x264</title>
   <guid>guid-2</guid>
   <link>magnet:?xt=urn:btih:FEED</link>
   <torznab:attr name="seeders" value="3" />
  </item>
 </channel>
</rss>"#;

#[test]
fn parses_jackett_rss_items() {
    let items = parse_items(RSS.as_bytes()).unwrap();
    assert_eq!(items.len(), 2);
    let r = &items[0];
    assert_eq!(r.title, "The.Matrix.1999.1080p.BluRay.x265-GRP");
    assert_eq!(r.guid, "https://tracker.example/details?id=42&page=1");
    assert_eq!(
        r.link.as_deref(),
        Some("https://jackett.local/dl/abc?path=x&file=The.Matrix.torrent")
    );
    assert_eq!(r.size_bytes, Some(8_589_934_592));
    assert_eq!(r.seeders, Some(12));
    assert_eq!(r.leechers, Some(18));
    assert_eq!(r.info_hash.as_deref(), Some("ABCDEF0123456789"));
    assert!(r
        .magnet
        .as_deref()
        .unwrap()
        .starts_with("magnet:?xt=urn:btih:ABCDEF0123456789&dn="));
    assert_eq!(r.imdb_id.as_deref(), Some("tt0133093"));
    assert_eq!(r.tmdb_id, Some(603));
    assert!(r.published_at.as_deref().unwrap().contains("2026"));
    // <comments> is the tracker's torrent page and wins over the guid URL.
    assert_eq!(
        r.details_url.as_deref(),
        Some("https://tracker.example/torrent/42")
    );

    // Magnet-only item: the magnet landed in `magnet`, not `link`.
    let r2 = &items[1];
    assert_eq!(r2.magnet.as_deref(), Some("magnet:?xt=urn:btih:FEED"));
    assert_eq!(r2.link, None);
    // No comments + non-URL guid: no details link.
    assert_eq!(r2.details_url, None);
}

#[test]
fn surfaces_torznab_error_documents() {
    let xml =
        r#"<?xml version="1.0"?><error code="100" description="Incorrect user credentials" />"#;
    let err = parse_items(xml.as_bytes()).unwrap_err().to_string();
    assert!(err.contains("100") && err.contains("credentials"), "{err}");
}

#[test]
fn parses_caps_supported_params() {
    let xml = r#"<caps>
  <server title="Jackett" />
  <searching>
<search available="yes" supportedParams="q" />
<movie-search available="yes" supportedParams="q,imdbid,tmdbid" />
<tv-search available="yes" supportedParams="q,season,ep" />
  </searching>
</caps>"#;
    let caps = parse_caps(xml.as_bytes()).unwrap();
    assert_eq!(caps.server_title.as_deref(), Some("Jackett"));
    assert!(caps.search_tmdb && caps.search_imdb);
    assert!(!caps.tv_search_tmdb);
    // No external ids, but it does take a season - the shape most trackers
    // behind Jackett advertise, and the one worth a structured tvsearch.
    assert!(caps.tv_search_season);
}

#[test]
fn a_tv_search_without_a_season_param_is_not_claimed_to_take_one() {
    let xml = r#"<caps><searching>
      <tv-search available="yes" supportedParams="q" />
    </searching></caps>"#;
    let caps = parse_caps(xml.as_bytes()).unwrap();
    assert!(!caps.tv_search_season);
}

#[test]
fn empty_and_titleless_items_are_dropped() {
    let xml = r#"<rss><channel>
      <item><guid>x</guid></item>
      <item><title>Kept 1080p</title><guid>y</guid></item>
    </channel></rss>"#;
    let items = parse_items(xml.as_bytes()).unwrap();
    assert_eq!(items.len(), 1);
    assert_eq!(items[0].title, "Kept 1080p");
}

#[test]
fn attr_size_fills_when_no_size_element() {
    let xml = r#"<rss xmlns:torznab="http://torznab.com/"><channel><item>
      <title>Rel 720p</title><guid>g</guid>
      <torznab:attr name="size" value="12345" />
    </item></channel></rss>"#;
    let items = parse_items(xml.as_bytes()).unwrap();
    assert_eq!(items[0].size_bytes, Some(12345));
}

#[test]
fn peers_without_seeders_saturates_to_zero() {
    let xml = r#"<rss xmlns:torznab="http://torznab.com/"><channel><item>
      <title>Rel 1080p</title><guid>g</guid>
      <torznab:attr name="peers" value="5" />
    </item></channel></rss>"#;
    let items = parse_items(xml.as_bytes()).unwrap();
    // No seeders attr: leechers = peers - 0 = 5.
    assert_eq!(items[0].leechers, Some(5));
    assert_eq!(items[0].seeders, Some(0));
}

#[test]
fn caps_error_document_is_err() {
    let xml = r#"<caps><error code="200" description="nope" /></caps>"#;
    assert!(parse_caps(xml.as_bytes()).is_err());
}

#[test]
fn an_enclosure_supplies_the_link_when_the_item_has_no_link_element() {
    let xml = r#"<rss><channel><item>
      <title>Rel 1080p</title><guid>g</guid>
      <enclosure url="https://jackett.local/dl/abc.torrent" length="10" />
    </item></channel></rss>"#;
    let items = parse_items(xml.as_bytes()).unwrap();
    assert_eq!(
        items[0].link.as_deref(),
        Some("https://jackett.local/dl/abc.torrent")
    );
}

#[test]
fn feed_level_elements_outside_an_item_are_ignored() {
    let xml = r#"<rss xmlns:atom="http://www.w3.org/2005/Atom" xmlns:torznab="http://torznab.com/"><channel>
      <atom:link href="https://jackett.local/api" rel="self" />
      <enclosure url="https://jackett.local/not-a-release.torrent" />
      <torznab:attr name="seeders" value="999" />
      <item><title>Rel 1080p</title><guid>g</guid>
        <torznab:attr name="seeders" value="4" /></item>
    </channel></rss>"#;
    let items = parse_items(xml.as_bytes()).unwrap();
    assert_eq!(items.len(), 1);
    assert_eq!(items[0].seeders, Some(4));
    assert_eq!(items[0].link, None);
}

#[test]
fn attributes_the_parser_does_not_model_are_skipped_rather_than_confused() {
    let xml = r#"<rss xmlns:torznab="http://torznab.com/"><channel><item>
      <title>Rel 1080p</title><guid>g</guid>
      <torznab:attr name="seeders" value="7" type="int" />
    </item></channel></rss>"#;
    let items = parse_items(xml.as_bytes()).unwrap();
    assert_eq!(items[0].seeders, Some(7));

    let err = r#"<error code="100" description="bad key" xmlns="http://x" other="ignored" />"#;
    let message = parse_items(err.as_bytes()).unwrap_err().to_string();
    assert!(
        message.contains("100") && message.contains("bad key"),
        "{message}"
    );
}

#[test]
fn a_blank_element_leaves_its_field_unset() {
    let xml = r#"<rss><channel><item>
      <title>Rel 1080p</title><guid>g</guid>
      <size>   </size><pubDate></pubDate>
    </item></channel></rss>"#;
    let items = parse_items(xml.as_bytes()).unwrap();
    assert_eq!(items[0].size_bytes, None);
    assert_eq!(items[0].published_at, None);
}

#[test]
fn a_comments_element_that_is_not_a_url_is_not_a_details_link() {
    let xml = r#"<rss><channel><item>
      <title>Rel 1080p</title><guid>g</guid>
      <comments>42 comments</comments>
    </item></channel></rss>"#;
    let items = parse_items(xml.as_bytes()).unwrap();
    assert_eq!(items[0].details_url, None);
}

#[test]
fn an_item_nested_inside_another_yields_one_release_not_a_duplicate() {
    let xml = r#"<rss><channel><item><item>
      <title>Rel 1080p</title><guid>g</guid>
    </item></item></channel></rss>"#;
    let items = parse_items(xml.as_bytes()).unwrap();
    assert_eq!(items.len(), 1);
    assert_eq!(items[0].title, "Rel 1080p");
}

#[test]
fn a_freeleech_item_carries_the_volume_factors_the_tracker_announced() {
    let xml = r#"<rss xmlns:torznab="http://torznab.com/"><channel><item>
      <title>Rel 1080p</title><guid>g</guid>
      <torznab:attr name="downloadvolumefactor" value="0" />
      <torznab:attr name="uploadvolumefactor" value="2" />
    </item></channel></rss>"#;

    let items = parse_items(xml.as_bytes()).unwrap();

    assert_eq!(items[0].download_volume_factor, Some(0.0));
    assert_eq!(items[0].upload_volume_factor, Some(2.0));
}

#[test]
fn an_item_that_announces_no_volume_factor_carries_none() {
    let xml = r#"<rss><channel><item>
      <title>Rel 1080p</title><guid>g</guid>
    </item></channel></rss>"#;

    let items = parse_items(xml.as_bytes()).unwrap();

    assert_eq!(items[0].download_volume_factor, None);
    assert_eq!(items[0].upload_volume_factor, None);
}

#[test]
fn caps_without_search_flags_defaults_false() {
    let xml = r#"<caps><server title="X" /></caps>"#;
    let caps = parse_caps(xml.as_bytes()).unwrap();
    assert_eq!(caps.server_title.as_deref(), Some("X"));
    assert!(!caps.search_tmdb && !caps.search_imdb && !caps.tv_search_tmdb);
}

#[test]
fn a_newznab_item_is_a_usenet_release_that_reports_no_swarm() {
    let xml = r#"<rss xmlns:newznab="http://www.newznab.com/DTD/2010/feeds/attributes/"><channel><item>
      <title>The.Matrix.1999.1080p.BluRay.x264-GRP</title><guid>nzb-42</guid>
      <link>https://indexer.example/getnzb/42.nzb?apikey=k</link>
      <enclosure url="https://indexer.example/getnzb/42.nzb?apikey=k" length="8000" type="application/x-nzb" />
      <newznab:attr name="grabs" value="318" />
      <newznab:attr name="imdb" value="0133093" />
    </item></channel></rss>"#;

    let items = parse_items(xml.as_bytes()).unwrap();

    assert_eq!(items[0].protocol, USENET);
    assert_eq!(items[0].seeders, None);
    assert_eq!(items[0].grabs, Some(318));
    assert_eq!(items[0].imdb_id.as_deref(), Some("0133093"));
}

#[test]
fn a_jackett_item_is_a_torrent() {
    let items = parse_items(RSS.as_bytes()).unwrap();

    assert!(items.iter().all(|r| r.protocol == TORRENT));
}

#[test]
fn a_magnet_makes_a_torrent_even_beside_an_nzb_enclosure() {
    let xml = r#"<rss><channel><item>
      <title>Rel 1080p</title><guid>g</guid>
      <link>magnet:?xt=urn:btih:FEED</link>
      <enclosure url="https://indexer.example/42.nzb" type="application/x-nzb" />
    </item></channel></rss>"#;

    let items = parse_items(xml.as_bytes()).unwrap();

    assert_eq!(items[0].protocol, TORRENT);
}
