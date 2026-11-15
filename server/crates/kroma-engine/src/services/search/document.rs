//! One catalogue row into one tantivy document and one [`Entry`] beside it.

use tantivy::tokenizer::TextAnalyzer;
use tantivy::IndexWriter;
use tantivy::TantivyDocument;

use super::entry::{joined, prior, tokens, Entry};
use super::hit::HitKind;
use super::people::{Person, Roster};
use super::schema::Fields;
use crate::db::translations::TransData;
use crate::model::{MediaItem, Metadata, Show};

pub(super) struct Indexer<'a> {
    writer: &'a mut IndexWriter,
    fields: &'a Fields,
    analyzer: TextAnalyzer,
    entries: Vec<Entry>,
    roster: Roster,
}

struct Draft {
    doc: TantivyDocument,
    titles: Vec<Vec<String>>,
}

impl<'a> Indexer<'a> {
    pub(super) fn new(writer: &'a mut IndexWriter, fields: &'a Fields, analyzer: TextAnalyzer) -> Self {
        Self {
            writer,
            fields,
            analyzer,
            entries: Vec::new(),
            roster: Roster::default(),
        }
    }

    pub(super) fn add_item(&mut self, item: &MediaItem, kind: HitKind, tr: Option<&Vec<TransData>>) {
        if item.id.is_empty() {
            return;
        }
        let f = self.fields;
        let mut draft = self.draft();
        self.title(&mut draft, f.title, &item.title);
        if let Some(title) = &item.episode_title {
            self.title(&mut draft, f.title, title);
        }
        if let Some(show_title) = &item.show_title {
            draft.doc.add_text(f.show_title, show_title);
        }
        if let Some(season) = item.season {
            draft.doc.add_u64(f.season, u64::from(season));
        }
        if let Some(episode) = item.episode {
            draft.doc.add_u64(f.episode, u64::from(episode));
        }
        self.metadata(&mut draft, &item.title, item.metadata.as_ref());
        self.translations(&mut draft, &item.title, tr);
        if kind == HitKind::Movie {
            self.credits(item.metadata.as_ref(), &item.library);
        }
        self.commit(
            draft,
            Entry {
                id: item.id.clone(),
                kind,
                show_id: item.show_id.clone().filter(|_| kind == HitKind::Episode),
                library: item.library.clone(),
                year: item.year,
                season: item.season,
                episode: item.episode,
                titles: Vec::new(),
                prior: prior(item.metadata.as_ref().and_then(|m| m.rating)),
            },
        );
    }

    pub(super) fn add_show(&mut self, show: &Show, tr: Option<&Vec<TransData>>) {
        if show.id.is_empty() {
            return;
        }
        let mut draft = self.draft();
        self.title(&mut draft, self.fields.title, &show.title);
        self.metadata(&mut draft, &show.title, show.metadata.as_ref());
        self.translations(&mut draft, &show.title, tr);
        self.credits(show.metadata.as_ref(), &show.library);
        self.commit(
            draft,
            Entry {
                id: show.id.clone(),
                kind: HitKind::Show,
                show_id: None,
                library: show.library.clone(),
                year: show.year,
                season: None,
                episode: None,
                titles: Vec::new(),
                prior: prior(show.metadata.as_ref().and_then(|m| m.rating)),
            },
        );
    }

    pub(super) fn finish(self) -> (Vec<Entry>, Vec<Person>) {
        (self.entries, self.roster.finish())
    }

    fn draft(&self) -> Draft {
        let mut doc = TantivyDocument::new();
        doc.add_u64(self.fields.ord, self.entries.len() as u64);
        Draft {
            doc,
            titles: Vec::new(),
        }
    }

    fn commit(&mut self, draft: Draft, mut entry: Entry) {
        entry.titles = draft.titles;
        if self.writer.add_document(draft.doc).is_ok() {
            self.entries.push(entry);
        }
    }

    fn title(&mut self, draft: &mut Draft, field: tantivy::schema::Field, title: &str) {
        let words = tokens(&mut self.analyzer, title);
        if words.is_empty() || draft.titles.contains(&words) {
            return;
        }
        draft.doc.add_text(field, title);
        for spelling in joined(&words) {
            draft.doc.add_text(self.fields.joined, spelling);
        }
        draft.titles.push(words);
    }

    fn translations(&mut self, draft: &mut Draft, file_title: &str, tr: Option<&Vec<TransData>>) {
        let Some(list) = tr else { return };
        let f = self.fields;
        for t in list {
            if let Some(title) = &t.title {
                if !title.eq_ignore_ascii_case(file_title) {
                    self.title(draft, f.alt_title, title);
                }
            }
            if let Some(overview) = &t.overview {
                draft.doc.add_text(f.overview, overview);
            }
            for genre in &t.genres {
                draft.doc.add_text(f.genres, genre);
            }
        }
    }

    fn metadata(&mut self, draft: &mut Draft, file_title: &str, meta: Option<&Metadata>) {
        let Some(meta) = meta else { return };
        let f = self.fields;
        if let Some(title) = &meta.title {
            if !title.eq_ignore_ascii_case(file_title) {
                self.title(draft, f.alt_title, title);
            }
        }
        if let Some(overview) = &meta.overview {
            draft.doc.add_text(f.overview, overview);
        }
        for genre in &meta.genres {
            draft.doc.add_text(f.genres, genre);
        }
        for member in &meta.cast {
            draft.doc.add_text(f.cast, &member.name);
        }
        for member in &meta.crew {
            draft.doc.add_text(f.crew, &member.name);
        }
    }

    fn credits(&mut self, meta: Option<&Metadata>, library: &str) {
        let Some(meta) = meta else { return };
        for member in &meta.cast {
            self.roster.credit(
                &mut self.analyzer,
                &member.name,
                member.tmdb_id,
                member.profile_url.as_deref(),
                library,
            );
        }
        for member in &meta.crew {
            self.roster.credit(
                &mut self.analyzer,
                &member.name,
                member.tmdb_id,
                member.profile_url.as_deref(),
                library,
            );
        }
    }
}
