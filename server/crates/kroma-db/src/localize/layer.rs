use std::collections::HashMap;

use kroma_domain::{MediaItem, Metadata, Show};

use super::{apply, apply_show};
use crate::art_beside::Art;
use crate::translations::{self, TransData};
use crate::{Connection, Result};

pub(super) struct Ask<'a> {
    pub conn: &'a Connection,
    pub locale: &'a str,
}

impl Ask<'_> {
    pub(super) fn layer(&self, kind: &str, ids: &[&str]) -> Result<Layer> {
        Ok(Layer {
            text: translations::resolve_many(self.conn, kind, ids, self.locale)?,
            art: Art::load(self.conn, kind, ids)?,
        })
    }
}

pub(super) struct Layer {
    text: HashMap<String, TransData>,
    art: Art,
}

impl Layer {
    pub(super) fn on_item(&self, item: &mut MediaItem) {
        if let Some(tr) = self.text.get(&item.id) {
            apply_item(item, tr);
        }
        self.art.paint(&item.id, item.metadata.as_mut());
    }

    pub(super) fn on_show(&self, show: &mut Show) {
        if let Some(tr) = self.text.get(&show.id) {
            apply_show(show, tr);
        }
        self.art.paint(&show.id, show.metadata.as_mut());
    }

    pub(super) fn on_metadata(&self, id: &str, meta: &mut Metadata) {
        if let Some(tr) = self.text.get(id) {
            apply(Some(meta), tr);
        }
        self.art.paint(id, Some(meta));
    }

    pub(super) fn title(&self, id: &str) -> Option<&str> {
        self.text.get(id).and_then(|tr| tr.title.as_deref())
    }

    pub(super) fn poster_onto(&self, id: &str, meta: Option<&mut Metadata>) {
        self.art.paint_poster(id, meta);
    }
}

pub(super) fn apply_item(item: &mut MediaItem, tr: &TransData) {
    apply(item.metadata.as_mut(), tr);
    if let Some(t) = &tr.title {
        item.title = t.clone();
        // An episode row prints `episodeTitle ?? title`, so leaving the scan's
        // name here keeps the filename's language on a card whose title has
        // just been translated.
        if item.episode_title.is_some() {
            item.episode_title = Some(t.clone());
        }
    }
}

#[cfg(test)]
mod tests;
