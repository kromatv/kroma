use super::*;

#[derive(Default)]
struct Provider {
    pages: u32,
    broken_page: Option<u32>,
    asked: Vec<u32>,
}

impl Provider {
    fn read(&mut self, page: u32) -> Result<DiscoverPage, ()> {
        self.asked.push(page);
        if self.broken_page == Some(page) {
            return Err(());
        }
        Ok(DiscoverPage {
            hits: vec![film(u64::from(page))],
            page,
            total_pages: self.pages,
        })
    }
}

fn tmdb_ids(hits: &[DiscoverHit]) -> Vec<u64> {
    hits.iter().map(|hit| hit.tmdb_id).collect()
}

#[test]
fn reading_stops_at_the_provider_s_last_page() {
    let mut provider = Provider { pages: 2, ..Provider::default() };

    let hits = read_pages(|page| provider.read(page));

    assert_eq!(provider.asked, [1, 2]);
    assert_eq!(tmdb_ids(&hits), [1, 2]);
}

#[test]
fn a_page_that_fails_ends_the_reading_and_keeps_what_was_read() {
    let mut provider = Provider { pages: 4, broken_page: Some(3), ..Provider::default() };

    let hits = read_pages(|page| provider.read(page));

    assert_eq!(provider.asked, [1, 2, 3]);
    assert_eq!(tmdb_ids(&hits), [1, 2]);
}

#[test]
fn reading_never_goes_past_its_own_page_limit() {
    let mut provider = Provider { pages: PAGES + 10, ..Provider::default() };

    let hits = read_pages(|page| provider.read(page));

    assert_eq!(provider.asked, (1..=PAGES).collect::<Vec<_>>());
    assert_eq!(hits.len(), provider.asked.len());
}

#[test]
fn films_and_shows_are_ranked_in_turn_and_the_first_film_leads() {
    let world = world_of(vec![film(1), film(2)], vec![show(7), show(8)]).expect("a world");

    assert_eq!(*world.ranked, [(false, 1), (true, 7), (false, 2), (true, 8)]);
    assert_eq!(titles(&world.covers), ["Title 1", "Title 7", "Title 2", "Title 8"]);
}

#[test]
fn a_provider_with_nothing_to_rank_gives_no_world() {
    let world = world_of(Vec::new(), Vec::new());

    assert!(world.is_none());
}

#[test]
fn a_title_with_no_backdrop_keeps_its_place_and_gives_no_cover() {
    let bare = DiscoverHit { backdrop_url: None, ..film(2) };

    let world = world_of(vec![film(1), bare, film(3)], Vec::new()).expect("a world");

    assert_eq!(*world.ranked, [(false, 1), (false, 2), (false, 3)]);
    assert_eq!(titles(&world.covers), ["Title 1", "Title 3"]);
}

#[test]
fn the_covers_stop_at_their_cap_and_the_ranking_does_not() {
    let films: Vec<DiscoverHit> = (1..).map(film).take(COVERS + 5).collect();

    let world = world_of(films, Vec::new()).expect("a world");

    assert_eq!(world.covers.len(), COVERS);
    assert_eq!(world.covers.last().map(|cover| cover.title.as_str()), Some("Title 48"));
    assert_eq!(world.ranked.len(), COVERS + 5);
}

#[test]
fn a_cover_says_whether_its_title_is_a_film_or_a_show() {
    let world = world_of(vec![film(1)], vec![show(7)]).expect("a world");

    let kinds: Vec<&str> = world.covers.iter().map(|cover| cover.kind.as_str()).collect();
    assert_eq!(kinds, ["movie", "show"]);
}

#[test]
fn every_cover_is_marked_as_trending() {
    let world = world_of(vec![film(1), film(2)], vec![show(7)]).expect("a world");

    let marks: Vec<bool> = world.covers.iter().map(|cover| cover.trending).collect();
    assert_eq!(marks, [true, true, true]);
}

#[test]
fn a_cover_carries_what_the_provider_says_of_its_title() {
    let entry = cover(film(603)).expect("a cover");

    assert_eq!(entry.title, "Title 603");
    assert_eq!(entry.year, Some(1999));
    assert_eq!(entry.backdrop_url, "backdrop/603");
    assert_eq!(entry.poster_url.as_deref(), Some("poster/603"));
    assert_eq!(entry.rating, Some(8.5));
}
