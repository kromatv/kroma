//! Genre identity for ranking: the provider's ids, with the combined
//! television genres read as the film genres they are made of.

use crate::i18n;

/// The provider's genre ids, by the slug their `genre.*` copy is keyed on.
/// Mirrors `packages/core/src/genre-table.ts`, which a test holds it to.
pub const GENRES: [(u32, &str); 27] = [
    (28, "action"),
    (10759, "action-adventure"),
    (12, "adventure"),
    (16, "animation"),
    (35, "comedy"),
    (80, "crime"),
    (99, "documentary"),
    (18, "drama"),
    (10751, "family"),
    (14, "fantasy"),
    (36, "history"),
    (27, "horror"),
    (10762, "kids"),
    (10402, "music"),
    (9648, "mystery"),
    (10763, "news"),
    (10764, "reality"),
    (10749, "romance"),
    (10765, "sci-fi-fantasy"),
    (878, "science-fiction"),
    (10766, "soap"),
    (10767, "talk"),
    (53, "thriller"),
    (10770, "tv-movie"),
    (10752, "war"),
    (10768, "war-politics"),
    (37, "western"),
];

pub const ACTION: u32 = 28;
pub const ADVENTURE: u32 = 12;
pub const ANIMATION: u32 = 16;
pub const COMEDY: u32 = 35;
pub const CRIME: u32 = 80;
pub const DOCUMENTARY: u32 = 99;
pub const DRAMA: u32 = 18;
pub const FAMILY: u32 = 10751;
pub const FANTASY: u32 = 14;
pub const HISTORY: u32 = 36;
pub const HORROR: u32 = 27;
pub const MUSIC: u32 = 10402;
pub const MYSTERY: u32 = 9648;
pub const ROMANCE: u32 = 10749;
pub const SCIENCE_FICTION: u32 = 878;
pub const THRILLER: u32 = 53;
pub const WAR: u32 = 10752;

fn parts(id: u32) -> &'static [u32] {
    match id {
        10759 => &[ACTION, ADVENTURE],
        10765 => &[SCIENCE_FICTION, FANTASY],
        10768 => &[WAR],
        10762 => &[FAMILY],
        _ => &[],
    }
}

/// The genres a title counts under: its own ids, a combined television genre
/// replaced by its parts, each once.
pub fn canonical(ids: &[u32]) -> Vec<u32> {
    let mut out: Vec<u32> = Vec::with_capacity(ids.len() + 1);
    for id in ids {
        let parts = parts(*id);
        let spread: &[u32] = if parts.is_empty() {
            std::slice::from_ref(id)
        } else {
            parts
        };
        for genre in spread {
            if !out.contains(genre) {
                out.push(*genre);
            }
        }
    }
    out
}

/// The id a stored display name denotes, in any language the app has copy for.
/// A library enriched before ids were kept only has the names.
pub fn id_of_name(name: &str) -> Option<u32> {
    let folded = fold(name);
    if folded.is_empty() {
        return None;
    }
    GENRES.iter().find_map(|(id, slug)| {
        let key = format!("genre.{slug}");
        let spelled = i18n::SUPPORTED_LOCALES
            .iter()
            .any(|locale| fold(&i18n::t(locale, &key, &[])) == folded);
        (spelled || fold(slug) == folded).then_some(*id)
    })
}

/// A genre's name in `locale`, `None` for an id the app has no copy for.
pub fn label(locale: &str, id: u32) -> Option<String> {
    let (_, slug) = GENRES.iter().find(|(known, _)| *known == id)?;
    Some(i18n::t(locale, &format!("genre.{slug}"), &[]))
}

fn fold(name: &str) -> String {
    crate::domain::slug::slugify(name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_combined_television_genre_counts_as_the_film_genres_it_is_made_of() {
        assert_eq!(canonical(&[10765, 18]), [SCIENCE_FICTION, FANTASY, DRAMA]);
        assert_eq!(canonical(&[10759, ACTION]), [ACTION, ADVENTURE]);
        assert_eq!(canonical(&[COMEDY]), [COMEDY]);
    }

    #[test]
    fn a_stored_name_resolves_in_either_language() {
        assert_eq!(id_of_name("Science Fiction"), Some(SCIENCE_FICTION));
        assert_eq!(id_of_name("Science-Fiction"), Some(SCIENCE_FICTION));
        assert_eq!(id_of_name("Comédie"), Some(COMEDY));
        assert_eq!(id_of_name("Horreur"), Some(HORROR));
        assert_eq!(id_of_name("Nonsense"), None);
        assert_eq!(id_of_name(""), None);
    }

    #[test]
    fn a_genre_is_named_in_the_reader_s_language() {
        assert_eq!(label("en", COMEDY).as_deref(), Some("Comedy"));
        assert_eq!(label("fr", COMEDY).as_deref(), Some("Comédie"));
        assert_eq!(label("en", 1), None);
    }

    #[test]
    fn the_table_matches_the_one_the_clients_ship() {
        let source = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../packages/core/src/genre-table.ts"
        ))
        .unwrap();
        for (id, slug) in GENRES {
            assert!(
                source.contains(&format!("slug: '{slug}', tmdb: {id},")),
                "{slug} ({id}) is not in genre-table.ts"
            );
        }
        assert_eq!(source.matches("{ slug: '").count(), GENRES.len());
    }
}
