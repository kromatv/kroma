use anyhow::Result;
use std::collections::HashMap;
use tantivy::schema::Field;
use tantivy::schema::Schema;
use tantivy::schema::Value;
use tantivy::{Index, IndexReader, IndexWriter, ReloadPolicy, TantivyDocument};

use super::document::{add_item, add_show};
use super::schema::{self, Fields, ANALYZER};
use crate::db::translations::TransData;
use crate::model::{MediaItem, Show};

pub(super) struct Active {
    pub(super) reader: IndexReader,
    // Held so the in-RAM directory and its registered tokenizer outlive `reader`.
    pub(super) _index: Index,
}

#[allow(clippy::too_many_arguments)]
pub(super) fn build_active(
    schema: Schema,
    fields: &Fields,
    movies: &[MediaItem],
    shows: &[Show],
    episodes: &[MediaItem],
    tr_movies: &HashMap<String, Vec<TransData>>,
    tr_eps: &HashMap<String, Vec<TransData>>,
    tr_shows: &HashMap<String, Vec<TransData>>,
) -> Result<Active> {
    let index = schema::new_index(schema);
    let mut writer: IndexWriter = index.writer_with_num_threads(1, 15_000_000)?;
    for m in movies {
        add_item(&mut writer, fields, m, "movie", tr_movies.get(&m.id));
    }
    for e in episodes {
        add_item(&mut writer, fields, e, "episode", tr_eps.get(&e.id));
    }
    for s in shows {
        add_show(&mut writer, fields, s, tr_shows.get(&s.id));
    }
    writer.commit()?;
    let reader = index
        .reader_builder()
        .reload_policy(ReloadPolicy::OnCommitWithDelay)
        .try_into()?;
    reader.reload()?;
    Ok(Active {
        reader,
        _index: index,
    })
}

// Uses the index's own analyzer so query terms fold identically to indexed ones.
pub(super) fn normalize(index: &Index, raw: &str) -> Vec<String> {
    let Some(mut analyzer) = index.tokenizers().get(ANALYZER) else {
        return raw.split_whitespace().map(str::to_lowercase).collect();
    };
    let mut stream = analyzer.token_stream(raw);
    let mut tokens = Vec::new();
    while stream.advance() {
        tokens.push(stream.token().text.clone());
    }
    tokens
}

pub(super) fn field_str(doc: &TantivyDocument, field: Field) -> String {
    doc.get_first(field)
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string()
}
