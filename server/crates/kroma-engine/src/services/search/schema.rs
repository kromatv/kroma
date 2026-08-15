//! The tantivy schema + the shared KROMA text analyzer: lowercase and diacritic
//! fold, so "amelie" matches "Amélie".

use tantivy::schema::{
    Field, IndexRecordOption, Schema, SchemaBuilder, TextFieldIndexing, TextOptions, STORED, STRING,
};
use tantivy::tokenizer::{
    AsciiFoldingFilter, LowerCaser, RemoveLongFilter, SimpleTokenizer, TextAnalyzer,
};
use tantivy::Index;

pub(super) const ANALYZER: &str = "kroma";

/// Field ids are stable across every index built from the same [`Schema`].
#[derive(Clone, Copy)]
pub(super) struct Fields {
    pub id: Field,
    pub kind: Field,
    pub show_id: Field,
    pub title: Field,
    pub alt_title: Field,
    pub show_title: Field,
    pub cast: Field,
    pub genres: Field,
    pub overview: Field,
}

fn text(b: &mut SchemaBuilder, name: &str) -> Field {
    let indexing = TextFieldIndexing::default()
        .set_tokenizer(ANALYZER)
        .set_index_option(IndexRecordOption::WithFreqsAndPositions);
    b.add_text_field(name, TextOptions::default().set_indexing_options(indexing))
}

pub(super) fn build() -> (Schema, Fields) {
    let mut b = Schema::builder();
    // Stored verbatim so a hit maps back to a DB row, and unanalyzed: exact
    // tokens, no fuzzy matching on them.
    let id = b.add_text_field("id", STRING | STORED);
    let kind = b.add_text_field("kind", STRING | STORED);
    // Read back to fold an episode under its show; never itself a query target.
    let show_id = b.add_text_field("show_id", STORED);
    let title = text(&mut b, "title");
    let alt_title = text(&mut b, "alt_title");
    let show_title = text(&mut b, "show_title");
    let cast = text(&mut b, "cast");
    let genres = text(&mut b, "genres");
    let overview = text(&mut b, "overview");
    let schema = b.build();
    let fields = Fields { id, kind, show_id, title, alt_title, show_title, cast, genres, overview };
    (schema, fields)
}

/// In-RAM, with the `kroma` analyzer registered.
pub(super) fn new_index(schema: Schema) -> Index {
    let index = Index::create_in_ram(schema);
    let analyzer = TextAnalyzer::builder(SimpleTokenizer::default())
        .filter(RemoveLongFilter::limit(40)) // ignore pathological "words"
        .filter(LowerCaser)
        .filter(AsciiFoldingFilter)
        .build();
    index.tokenizers().register(ANALYZER, analyzer);
    index
}
