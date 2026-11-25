use crate::metadata::Metadata;
use crate::ratings::{reader_rating, written_ratings};

pub(super) fn known(text: &str) -> bool {
    !written_ratings(text).is_empty()
}

pub(super) fn rated(meta: &mut Metadata, text: &str) {
    let ratings = written_ratings(text);
    let home = meta
        .age_rating
        .as_ref()
        .filter(|shown| !shown.borrowed)
        .map(|shown| shown.country.clone())
        .unwrap_or_default();
    let Some(shown) = reader_rating(&ratings, &home, &home) else {
        return;
    };
    meta.certification = Some(shown.label.clone());
    meta.age_rating = Some(shown);
    meta.ratings = ratings;
}
