//! What a person who manages the library wrote by hand about a film or a show
//! (LIB-83), and what the `.nfo` file beside it says (LIB-84). Each field comes
//! before the provider's, in every language, and a field left `None` keeps
//! following the provider. A release date written gives the year (LIB-87),
//! a sort title files the title under another name (LIB-88), an original
//! title names it in the language it was made in (LIB-94), a tagline stands
//! above its summary (LIB-95), and the names written as its directors stand in
//! for the provider's (LIB-96).

mod crew;
mod day;

use serde::{Deserialize, Serialize};

use crate::{MediaItem, Metadata, Show};
use day::{year_of, year_of_day};

/// The longest name a person can write for a title, in characters.
pub const TITLE_MAX: usize = 300;
/// The longest tagline a person can write for a title, in characters.
pub const TAGLINE_MAX: usize = 300;
/// The longest summary a person can write for a title, in characters.
pub const OVERVIEW_MAX: usize = 10_000;
/// How many genres a person can give a title.
pub const GENRES_MAX: usize = 20;
/// The longest genre name a person can write, in characters.
pub const GENRE_MAX: usize = 60;
/// How many directors a person can give a title.
pub const DIRECTORS_MAX: usize = 20;
/// The longest name a person can write for one director, in characters.
pub const PERSON_MAX: usize = 100;
/// The years a title can be given.
pub const YEARS: std::ops::RangeInclusive<u32> = 1800..=2200;

/// The fields written for one title, by hand or in its `.nfo` file.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct TitleEdit {
    #[serde(default)]
    pub title: Option<String>,
    /// The title in the language it was made in.
    #[serde(default, rename = "originalTitle")]
    pub original_title: Option<String>,
    /// The name the title sorts under, leaving the one shown as it is.
    #[serde(default, rename = "sortTitle")]
    pub sort_title: Option<String>,
    /// The short line that stands above the summary.
    #[serde(default)]
    pub tagline: Option<String>,
    #[serde(default)]
    pub overview: Option<String>,
    #[serde(default)]
    pub year: Option<u32>,
    /// The day the title came out, as `yyyy-mm-dd`.
    #[serde(default)]
    pub released: Option<String>,
    #[serde(default)]
    pub genres: Option<Vec<String>>,
    /// The people who directed the title, or created the show.
    #[serde(default)]
    pub directors: Option<Vec<String>>,
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

fn listed(names: Option<Vec<String>>) -> Option<Vec<String>> {
    let names: Vec<String> = names
        .into_iter()
        .flatten()
        .filter_map(|name| kept(Some(name)))
        .collect();
    (!names.is_empty()).then_some(names)
}

fn clip_list(names: Option<Vec<String>>, count: usize, each: usize) -> Option<Vec<String>> {
    names.map(|names| {
        let kept = names.into_iter().take(count);
        kept.map(|name| cut(name, each)).collect()
    })
}

fn list_fits(names: &Option<Vec<String>>, count: usize, each: usize) -> bool {
    let names = names.as_deref().unwrap_or_default();
    names.len() <= count && names.iter().all(|name| name.chars().count() <= each)
}

fn put(to: &mut Option<String>, written: &Option<String>) {
    if written.is_some() {
        to.clone_from(written);
    }
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
    /// The same edit with surrounding spaces trimmed, every field that is
    /// left empty handed back to the provider, and the year taken from the
    /// release date when one is written.
    pub fn tidied(self) -> Self {
        let released = kept(self.released);
        Self {
            title: kept(self.title),
            original_title: kept(self.original_title),
            sort_title: kept(self.sort_title),
            tagline: kept(self.tagline),
            overview: kept(self.overview),
            year: released.as_deref().and_then(year_of_day).or(self.year),
            released,
            genres: listed(self.genres),
            directors: listed(self.directors),
        }
    }

    /// This edit, with each field it leaves empty taken from `below`. The
    /// year and the release date go together: either both are this edit's,
    /// or both are `below`'s.
    pub fn over(self, below: Self) -> Self {
        let (year, released) = if self.year.is_some() || self.released.is_some() {
            (self.year, self.released)
        } else {
            (below.year, below.released)
        };
        Self {
            title: self.title.or(below.title),
            original_title: self.original_title.or(below.original_title),
            sort_title: self.sort_title.or(below.sort_title),
            tagline: self.tagline.or(below.tagline),
            overview: self.overview.or(below.overview),
            year,
            released,
            genres: self.genres.or(below.genres),
            directors: self.directors.or(below.directors),
        }
    }

    /// The same edit tidied and cut to what a title can hold: a name or a
    /// summary that runs long is cut short, the genres and the directors past
    /// the limit are dropped, and a year outside [`YEARS`] or a date that is
    /// no day is left out.
    pub fn clipped(self) -> Self {
        let tidied = self.tidied();
        Self {
            title: tidied.title.map(|title| cut(title, TITLE_MAX)),
            original_title: tidied.original_title.map(|title| cut(title, TITLE_MAX)),
            sort_title: tidied.sort_title.map(|title| cut(title, TITLE_MAX)),
            tagline: tidied.tagline.map(|text| cut(text, TAGLINE_MAX)),
            overview: tidied.overview.map(|text| cut(text, OVERVIEW_MAX)),
            year: tidied.year.filter(|year| YEARS.contains(year)),
            released: tidied.released.filter(|date| year_of_day(date).is_some()),
            genres: clip_list(tidied.genres, GENRES_MAX, GENRE_MAX),
            directors: clip_list(tidied.directors, DIRECTORS_MAX, PERSON_MAX),
        }
    }

    /// Whether every field follows the provider.
    pub fn is_empty(&self) -> bool {
        *self == Self::default()
    }

    /// Whether each field fits what a title can hold.
    pub fn fits(&self) -> bool {
        self.texts_fit()
            && self.year.is_none_or(|y| YEARS.contains(&y))
            && self
                .released
                .as_deref()
                .is_none_or(|d| year_of_day(d).is_some())
            && list_fits(&self.genres, GENRES_MAX, GENRE_MAX)
            && list_fits(&self.directors, DIRECTORS_MAX, PERSON_MAX)
    }

    fn texts_fit(&self) -> bool {
        let short = |text: &Option<String>, max: usize| {
            text.as_deref().is_none_or(|t| t.chars().count() <= max)
        };
        short(&self.title, TITLE_MAX)
            && short(&self.original_title, TITLE_MAX)
            && short(&self.sort_title, TITLE_MAX)
            && short(&self.tagline, TAGLINE_MAX)
            && short(&self.overview, OVERVIEW_MAX)
    }

    /// Put each field that was written in place of the provider's. Any field
    /// but the name and the year, written for a title the provider never
    /// described, gives it a [`Metadata::blank`] record to carry it.
    pub fn onto(&self, title: &mut impl Editable) {
        let to = title.written();
        if let Some(title) = &self.title {
            title.clone_into(to.title);
        }
        if self.year.is_some() {
            *to.year = self.year;
        }
        if self.describes() {
            to.metadata.get_or_insert_with(Metadata::blank);
        }
        if let Some(meta) = to.metadata.as_mut() {
            self.onto_metadata(meta);
        }
    }

    /// Put each field that was written in place of the provider's, on a
    /// title's record alone. A year written without a date drops the
    /// provider's release date when the two disagree, so the date never
    /// contradicts the year shown. Directors written replace the provider's
    /// directors and creators, and keep the profile of each one it named too.
    pub fn onto_metadata(&self, meta: &mut Metadata) {
        put(&mut meta.title, &self.title);
        put(&mut meta.original_title, &self.original_title);
        put(&mut meta.sort_title, &self.sort_title);
        self.date_onto(meta);
        put(&mut meta.tagline, &self.tagline);
        put(&mut meta.overview, &self.overview);
        if let Some(genres) = &self.genres {
            meta.genres.clone_from(genres);
            meta.tmdb_genre_ids.clear();
        }
        if let Some(directors) = &self.directors {
            crew::directed_by(&mut meta.crew, directors);
        }
    }

    fn describes(&self) -> bool {
        let named = Self {
            title: self.title.clone(),
            year: self.year,
            ..Self::default()
        };
        *self != named
    }

    fn date_onto(&self, meta: &mut Metadata) {
        if self.released.is_some() {
            meta.release_date.clone_from(&self.released);
        } else if let Some(year) = self.year {
            let dated = meta.release_date.as_deref().and_then(year_of);
            if dated.is_some_and(|dated| dated != year) {
                meta.release_date = None;
            }
        }
    }
}

#[cfg(test)]
mod tests;
