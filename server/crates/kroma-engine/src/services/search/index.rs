use anyhow::Result;
use std::collections::HashMap;
use tantivy::schema::Schema;
use tantivy::{Index, IndexReader, IndexWriter, ReloadPolicy};

use super::document::Indexer;
use super::entry::Entry;
use super::hit::HitKind;
use super::people::Person;
use super::schema::{self, Fields, ANALYZER};
use crate::db::translations::TransData;
use crate::model::{MediaItem, Show};

pub(super) struct Active {
    pub(super) reader: IndexReader,
    // Held so the in-RAM directory and its registered tokenizer outlive `reader`.
    pub(super) _index: Index,
    pub(super) entries: Vec<Entry>,
    pub(super) people: Vec<Person>,
    pub(super) libraries: Vec<String>,
}

pub(super) struct Catalog<'a> {
    pub movies: &'a [MediaItem],
    pub shows: &'a [Show],
    pub episodes: &'a [MediaItem],
    pub tr_movies: &'a HashMap<String, Vec<TransData>>,
    pub tr_episodes: &'a HashMap<String, Vec<TransData>>,
    pub tr_shows: &'a HashMap<String, Vec<TransData>>,
}

pub(super) fn build_active(schema: Schema, fields: &Fields, catalog: &Catalog) -> Result<Active> {
    let index = schema::new_index(schema);
    let mut writer: IndexWriter = index.writer_with_num_threads(1, 15_000_000)?;
    let mut indexer = Indexer::new(&mut writer, fields, schema::analyzer());
    for movie in catalog.movies {
        indexer.add_item(movie, HitKind::Movie, catalog.tr_movies.get(&movie.id));
    }
    for episode in catalog.episodes {
        indexer.add_item(episode, HitKind::Episode, catalog.tr_episodes.get(&episode.id));
    }
    for show in catalog.shows {
        indexer.add_show(show, catalog.tr_shows.get(&show.id));
    }
    let (entries, people) = indexer.finish();
    let libraries: std::collections::BTreeSet<String> =
        entries.iter().map(|entry| entry.library.clone()).collect();
    writer.commit()?;
    let reader = index
        .reader_builder()
        .reload_policy(ReloadPolicy::OnCommitWithDelay)
        .try_into()?;
    reader.reload()?;
    Ok(Active {
        reader,
        _index: index,
        entries,
        people,
        libraries: libraries.into_iter().collect(),
    })
}

// Uses the index's own analyzer so query terms fold identically to indexed ones.
pub(super) fn normalize(index: &Index, raw: &str) -> Vec<String> {
    let Some(mut analyzer) = index.tokenizers().get(ANALYZER) else {
        return raw.split_whitespace().map(str::to_lowercase).collect();
    };
    super::entry::tokens(&mut analyzer, raw)
}
