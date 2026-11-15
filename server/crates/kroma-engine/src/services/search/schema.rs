//! The tantivy schema + the shared KROMA text analyzer: lowercase and diacritic
//! fold, so "amelie" matches "Amélie".

use tantivy::schema::{
    Field, IndexRecordOption, Schema, SchemaBuilder, TextFieldIndexing, TextOptions, FAST, INDEXED,
};
use tantivy::tokenizer::{
    AsciiFoldingFilter, LowerCaser, RemoveLongFilter, SimpleTokenizer, TextAnalyzer,
};
use tantivy::Index;

pub(super) const ANALYZER: &str = "kroma";
pub(super) const ORD: &str = "ord";

/// Field ids are stable across every index built from the same [`Schema`].
#[derive(Clone, Copy)]
pub(super) struct Fields {
    pub ord: Field,
    pub season: Field,
    pub episode: Field,
    pub title: Field,
    pub alt_title: Field,
    pub joined: Field,
    pub show_title: Field,
    pub cast: Field,
    pub crew: Field,
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
    let ord = b.add_u64_field(ORD, FAST);
    let season = b.add_u64_field("season", INDEXED);
    let episode = b.add_u64_field("episode", INDEXED);
    let title = text(&mut b, "title");
    let alt_title = text(&mut b, "alt_title");
    let joined = text(&mut b, "joined");
    let show_title = text(&mut b, "show_title");
    let cast = text(&mut b, "cast");
    let crew = text(&mut b, "crew");
    let genres = text(&mut b, "genres");
    let overview = text(&mut b, "overview");
    let schema = b.build();
    let fields = Fields {
        ord,
        season,
        episode,
        title,
        alt_title,
        joined,
        show_title,
        cast,
        crew,
        genres,
        overview,
    };
    (schema, fields)
}

pub(super) fn analyzer() -> TextAnalyzer {
    TextAnalyzer::builder(SimpleTokenizer::default())
        .filter(RemoveLongFilter::limit(40))
        .filter(LowerCaser)
        .filter(AsciiFoldingFilter)
        .build()
}

/// In-RAM, with the `kroma` analyzer registered.
pub(super) fn new_index(schema: Schema) -> Index {
    let index = Index::create_in_ram(schema);
    index.tokenizers().register(ANALYZER, analyzer());
    index
}
