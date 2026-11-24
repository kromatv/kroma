//! What a person who manages the library wrote by hand about a film or a show
//! (LIB-83), and what the `.nfo` file beside it says (LIB-84). Each field comes
//! before the provider's, in every language, and a field left `None` keeps
//! following the provider.

use serde::{Deserialize, Serialize};

use crate::{MediaItem, Metadata, Show};

/// The longest name a person can write for a title, in characters.
pub const TITLE_MAX: usize = 300;
/// The longest summary a person can write for a title, in characters.
pub const OVERVIEW_MAX: usize = 10_000;
/// How many genres a person can give a title.
pub const GENRES_MAX: usize = 20;
/// The longest genre name a person can write, in characters.
pub const GENRE_MAX: usize = 60;
/// The years a title can be given.
pub const YEARS: std::ops::RangeInclusive<u32> = 1800..=2200;

/// The fields written for one title, by hand or in its `.nfo` file.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct TitleEdit {
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub overview: Option<String>,
    #[serde(default)]
    pub year: Option<u32>,
    #[serde(default)]
    pub genres: Option<Vec<String>>,
}

/// The parts of a title a [`TitleEdit`] writes onto.
pub struct Written<'a> {
    pub title: &'a mut String,
    pub year: &'a mut Option<u32>,
    pub metadata: &'a mut Option<Metadata>,
}

/// A film or a show, which a [`TitleEdit`] can be written onto.
pub trait Editable {
    /// The fields an edit writes.
    fn written(&mut self) -> Written<'_>;
}

macro_rules! editable {
    ($($title:ty),*) => {$(
        impl Editable for $title {
            fn written(&mut self) -> Written<'_> {
                Written {
                    title: &mut self.title,
                    year: &mut self.year,
                    metadata: &mut self.metadata,
                }
            }
        }
    )*};
}

editable!(MediaItem, Show);

fn kept(text: Option<String>) -> Option<String> {
    text.map(|t| t.trim().to_string()).filter(|t| !t.is_empty())
}

fn cut(text: String, max: usize) -> String {
    if text.chars().count() <= max {
        return text;
    }
    text.chars()
        .take(max)
        .collect::<String>()
        .trim_end()
        .to_string()
}

impl TitleEdit {
    /// The same edit with surrounding spaces trimmed, and every field that is
    /// left empty handed back to the provider.
    pub fn tidied(self) -> Self {
        let genres: Vec<String> = self
            .genres
            .into_iter()
            .flatten()
            .filter_map(|g| kept(Some(g)))
            .collect();
        Self {
            title: kept(self.title),
            overview: kept(self.overview),
            year: self.year,
            genres: (!genres.is_empty()).then_some(genres),
        }
    }

    /// This edit, with each field it leaves empty taken from `below`.
    pub fn over(self, below: Self) -> Self {
        Self {
            title: self.title.or(below.title),
            overview: self.overview.or(below.overview),
            year: self.year.or(below.year),
            genres: self.genres.or(below.genres),
        }
    }

    /// The same edit tidied and cut to what a title can hold: a name or a
    /// summary that runs long is cut short, the genres past the limit are
    /// dropped, and a year outside [`YEARS`] is left out.
    pub fn clipped(self) -> Self {
        let tidied = self.tidied();
        let genres = tidied.genres.map(|genres| {
            let kept = genres.into_iter().take(GENRES_MAX);
            kept.map(|genre| cut(genre, GENRE_MAX)).collect()
        });
        Self {
            title: tidied.title.map(|title| cut(title, TITLE_MAX)),
            overview: tidied.overview.map(|text| cut(text, OVERVIEW_MAX)),
            year: tidied.year.filter(|year| YEARS.contains(year)),
            genres,
        }
    }

    /// Whether every field follows the provider.
    pub fn is_empty(&self) -> bool {
        *self == Self::default()
    }

    /// Whether each field fits what a title can hold.
    pub fn fits(&self) -> bool {
        let genres = self.genres.as_deref().unwrap_or_default();
        let short = |text: &Option<String>, max: usize| {
            text.as_deref().is_none_or(|t| t.chars().count() <= max)
        };
        short(&self.title, TITLE_MAX)
            && short(&self.overview, OVERVIEW_MAX)
            && self.year.is_none_or(|y| YEARS.contains(&y))
            && genres.len() <= GENRES_MAX
            && genres.iter().all(|g| g.chars().count() <= GENRE_MAX)
    }

    /// Put each field that was written in place of the provider's. A summary
    /// or genres written for a title the provider never described give it a
    /// [`Metadata::blank`] record to carry them.
    pub fn onto(&self, title: &mut impl Editable) {
        let to = title.written();
        if let Some(title) = &self.title {
            title.clone_into(to.title);
        }
        if self.year.is_some() {
            *to.year = self.year;
        }
        if self.overview.is_some() || self.genres.is_some() {
            to.metadata.get_or_insert_with(Metadata::blank);
        }
        if let Some(meta) = to.metadata.as_mut() {
            self.onto_metadata(meta);
        }
    }

    /// Put each field that was written in place of the provider's, on a
    /// title's record alone.
    pub fn onto_metadata(&self, meta: &mut Metadata) {
        if self.title.is_some() {
            meta.title.clone_from(&self.title);
        }
        if self.overview.is_some() {
            meta.overview.clone_from(&self.overview);
        }
        if let Some(genres) = &self.genres {
            meta.genres.clone_from(genres);
            meta.tmdb_genre_ids.clear();
        }
    }
}

#[cfg(test)]
mod tests;
