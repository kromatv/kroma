use tantivy::IndexWriter;
use tantivy::TantivyDocument;

use super::schema::Fields;
use crate::db::translations::TransData;
use crate::model::{MediaItem, Metadata, Show};

pub(super) fn add_item(
    writer: &mut IndexWriter,
    f: &Fields,
    item: &MediaItem,
    kind: &str,
    tr: Option<&Vec<TransData>>,
) {
    let mut doc = TantivyDocument::new();
    doc.add_text(f.id, &item.id);
    doc.add_text(f.kind, kind);
    doc.add_text(f.title, &item.title);
    if let Some(t) = &item.episode_title {
        doc.add_text(f.title, t);
    }
    if let Some(st) = &item.show_title {
        doc.add_text(f.show_title, st);
    }
    if let Some(sid) = &item.show_id {
        doc.add_text(f.show_id, sid);
    }
    add_meta(&mut doc, f, &item.title, item.metadata.as_ref());
    add_translations(&mut doc, f, &item.title, tr);
    let _ = writer.add_document(doc);
}

pub(super) fn add_show(
    writer: &mut IndexWriter,
    f: &Fields,
    show: &Show,
    tr: Option<&Vec<TransData>>,
) {
    let mut doc = TantivyDocument::new();
    doc.add_text(f.id, &show.id);
    doc.add_text(f.kind, "show");
    doc.add_text(f.title, &show.title);
    add_meta(&mut doc, f, &show.title, show.metadata.as_ref());
    add_translations(&mut doc, f, &show.title, tr);
    let _ = writer.add_document(doc);
}

fn add_translations(
    doc: &mut TantivyDocument,
    f: &Fields,
    file_title: &str,
    tr: Option<&Vec<TransData>>,
) {
    let Some(list) = tr else { return };
    for t in list {
        if let Some(title) = &t.title {
            if !title.eq_ignore_ascii_case(file_title) {
                doc.add_text(f.alt_title, title);
            }
        }
        if let Some(o) = &t.overview {
            doc.add_text(f.overview, o);
        }
        for g in &t.genres {
            doc.add_text(f.genres, g);
        }
    }
}

fn add_meta(doc: &mut TantivyDocument, f: &Fields, file_title: &str, meta: Option<&Metadata>) {
    let Some(meta) = meta else { return };
    if let Some(t) = &meta.title {
        if !t.eq_ignore_ascii_case(file_title) {
            doc.add_text(f.alt_title, t);
        }
    }
    if let Some(o) = &meta.overview {
        doc.add_text(f.overview, o);
    }
    for g in &meta.genres {
        doc.add_text(f.genres, g);
    }
    for c in &meta.cast {
        doc.add_text(f.cast, &c.name);
    }
}
