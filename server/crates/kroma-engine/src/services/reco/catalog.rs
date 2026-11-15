//! The catalogue as the recommender ranks it: each title as a weighted set of
//! features, rare ones counting for more than common ones.

use std::collections::HashMap;

use crate::db::TitleFacts;

use super::genre;

/// One thing a title is: a genre, somebody in it, somebody behind it, its
/// decade, and whether it is a show.
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum Feature {
    Genre(u32),
    /// A genre the provider has no id for, by its stored name.
    NamedGenre(String),
    Cast(String),
    Director(String),
    Decade(u32),
    Show(bool),
}

const GENRE: f32 = 1.0;
const DIRECTOR: f32 = 0.9;
const LEAD: f32 = 0.7;
const SUPPORT: f32 = 0.35;
const DECADE: f32 = 0.25;
const FORM: f32 = 0.2;
const LEADS: usize = 3;

#[derive(Debug, Clone)]
pub struct Title {
    pub facts: TitleFacts,
    pub genres: Vec<u32>,
    /// Unit-length, so a dot product between two titles is a cosine.
    pub features: Vec<(Feature, f32)>,
}

impl Title {
    pub fn has_genre(&self, id: u32) -> bool {
        self.genres.contains(&id)
    }

    pub fn weight_of(&self, feature: &Feature) -> f32 {
        self.features
            .iter()
            .find(|(f, _)| f == feature)
            .map_or(0.0, |(_, w)| *w)
    }

    /// Cosine of the two titles' features: 1.0 for twins, 0.0 for strangers.
    pub fn resemblance(&self, other: &Title) -> f32 {
        self.features
            .iter()
            .map(|(feature, weight)| weight * other.weight_of(feature))
            .sum()
    }
}

#[derive(Debug, Default)]
pub struct Catalog {
    pub titles: Vec<Title>,
    by_id: HashMap<String, usize>,
    by_provider: HashMap<(bool, u64), usize>,
}

impl Catalog {
    pub fn build(facts: Vec<TitleFacts>) -> Self {
        let raw: Vec<RawTitle> = facts.iter().map(raw_features).collect();
        let mut seen_in: HashMap<&Feature, usize> = HashMap::new();
        for (_, features) in &raw {
            for (feature, _) in features {
                *seen_in.entry(feature).or_default() += 1;
            }
        }
        let total = facts.len() as f32;
        let rarity: HashMap<Feature, f32> = seen_in
            .into_iter()
            .map(|(feature, count)| (feature.clone(), (1.0 + total / count as f32).ln()))
            .collect();
        let titles: Vec<Title> = facts
            .into_iter()
            .zip(raw)
            .map(|(facts, (genres, features))| Title {
                facts,
                genres,
                features: unit(
                    features
                        .into_iter()
                        .map(|(feature, weight)| {
                            let rare = rarity.get(&feature).copied().unwrap_or(1.0);
                            (feature, weight * rare)
                        })
                        .collect(),
                ),
            })
            .collect();
        let by_id = titles
            .iter()
            .enumerate()
            .map(|(index, title)| (title.facts.id.clone(), index))
            .collect();
        let mut by_provider = HashMap::new();
        for (index, title) in titles.iter().enumerate() {
            if let Some(tmdb) = title.facts.tmdb_id {
                by_provider.entry((title.facts.show, tmdb)).or_insert(index);
            }
        }
        Self {
            titles,
            by_id,
            by_provider,
        }
    }

    /// The library's title for a provider id, when it holds one.
    pub fn by_provider(&self, show: bool, tmdb_id: u64) -> Option<&Title> {
        self.by_provider
            .get(&(show, tmdb_id))
            .map(|index| &self.titles[*index])
    }

    pub fn get(&self, id: &str) -> Option<&Title> {
        self.by_id.get(id).map(|index| &self.titles[*index])
    }

    pub fn is_empty(&self) -> bool {
        self.titles.is_empty()
    }
}

type RawTitle = (Vec<u32>, Vec<(Feature, f32)>);

fn raw_features(facts: &TitleFacts) -> RawTitle {
    let mut ids = facts.genre_ids.clone();
    let mut features: Vec<(Feature, f32)> = Vec::new();
    if ids.is_empty() {
        for name in &facts.genre_names {
            match genre::id_of_name(name) {
                Some(id) => ids.push(id),
                None => features.push((Feature::NamedGenre(name.trim().to_lowercase()), GENRE)),
            }
        }
    }
    let genres = genre::canonical(&ids);
    features.extend(genres.iter().map(|id| (Feature::Genre(*id), GENRE)));
    for name in &facts.directors {
        features.push((Feature::Director(person_key(name)), DIRECTOR));
    }
    for (billing, name) in facts.cast.iter().enumerate() {
        let weight = if billing < LEADS { LEAD } else { SUPPORT };
        features.push((Feature::Cast(person_key(name)), weight));
    }
    if let Some(year) = facts.year {
        features.push((Feature::Decade(year / 10 * 10), DECADE));
    }
    features.push((Feature::Show(facts.show), FORM));
    features.sort_by(|a, b| a.0.cmp(&b.0));
    features.dedup_by(|a, b| a.0 == b.0);
    (genres, features)
}

/// How a credited name is keyed, so two spellings of one casing fold together.
pub fn person_key(name: &str) -> String {
    name.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

pub(super) fn unit(mut features: Vec<(Feature, f32)>) -> Vec<(Feature, f32)> {
    let norm = features.iter().map(|(_, w)| w * w).sum::<f32>().sqrt();
    if norm > 0.0 {
        for (_, weight) in &mut features {
            *weight /= norm;
        }
    }
    features
}

#[cfg(test)]
pub(super) mod fixtures {
    use super::*;

    pub fn film(id: &str, genres: &[u32], cast: &[&str], director: &str) -> TitleFacts {
        TitleFacts {
            id: id.into(),
            library: "lib".into(),
            year: Some(2010),
            genre_ids: genres.to_vec(),
            cast: cast.iter().map(ToString::to_string).collect(),
            directors: if director.is_empty() {
                Vec::new()
            } else {
                vec![director.to_string()]
            },
            has_backdrop: true,
            has_overview: true,
            ..TitleFacts::default()
        }
    }

    pub fn series(id: &str, genres: &[u32]) -> TitleFacts {
        TitleFacts {
            show: true,
            episodes: 10,
            ..film(id, genres, &[], "")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::fixtures::{film, series};
    use super::*;
    use crate::services::reco::genre::{COMEDY, HORROR, SCIENCE_FICTION};

    #[test]
    fn two_films_sharing_a_director_resemble_each_other_more_than_two_sharing_a_genre() {
        let catalog = Catalog::build(vec![
            film("a", &[SCIENCE_FICTION], &[], "Denis Villeneuve"),
            film("b", &[COMEDY], &[], "Denis Villeneuve"),
            film("c", &[SCIENCE_FICTION], &[], "Somebody Else"),
            film("d", &[SCIENCE_FICTION], &[], ""),
            film("e", &[SCIENCE_FICTION], &[], ""),
        ]);
        let get = |id: &str| catalog.get(id).unwrap();

        let by_director = get("a").resemblance(get("b"));
        let by_genre = get("a").resemblance(get("c"));

        assert!(by_director > by_genre, "{by_director} vs {by_genre}");
    }

    #[test]
    fn a_title_resembles_itself_fully_and_a_stranger_barely() {
        let catalog = Catalog::build(vec![
            film("a", &[HORROR], &["Toni Collette"], "Ari Aster"),
            TitleFacts {
                year: Some(1950),
                show: true,
                ..film("z", &[COMEDY], &["Somebody"], "Nobody")
            },
        ]);
        let get = |id: &str| catalog.get(id).unwrap();

        assert!((get("a").resemblance(get("a")) - 1.0).abs() < 1e-5);
        assert!(get("a").resemblance(get("z")) < 1e-5);
    }

    #[test]
    fn a_science_fiction_show_shares_its_genre_with_a_science_fiction_film() {
        let catalog = Catalog::build(vec![
            film("film", &[SCIENCE_FICTION], &[], ""),
            series("serie", &[10765]),
        ]);

        assert!(catalog.get("serie").unwrap().has_genre(SCIENCE_FICTION));
        assert!(catalog.get("film").unwrap().resemblance(catalog.get("serie").unwrap()) > 0.0);
    }

    #[test]
    fn a_library_that_only_stored_genre_names_is_ranked_on_the_same_ids() {
        let named = TitleFacts {
            genre_ids: Vec::new(),
            genre_names: vec!["Horreur".into(), "Maison".into()],
            ..film("old", &[], &[], "")
        };

        let catalog = Catalog::build(vec![named]);
        let old = catalog.get("old").unwrap();

        assert_eq!(old.genres, [HORROR]);
        assert!(old.weight_of(&Feature::NamedGenre("maison".into())) > 0.0);
    }

    #[test]
    fn a_credited_name_folds_case_and_spacing() {
        assert_eq!(person_key("  Tom   HARDY "), "tom hardy");
    }
}
