use std::collections::HashMap;
use std::path::PathBuf;

use crate::db::art_beside::{Picture, BACKDROP, POSTER};
use crate::db::metadata_core::{ITEM, SHOW};
use crate::infra::image::{beside_name, PUBLIC_PREFIX};
use crate::model::{Kind, MediaItem, Show};
use crate::services::art_beside::{film_art, show_art, Art, Folders};

struct Subject<'a> {
    kind: &'static str,
    id: &'a str,
    library: &'a str,
}

pub(super) fn pictures_beside(
    items: &HashMap<String, MediaItem>,
    shows: &HashMap<String, Show>,
    pictures: Vec<PathBuf>,
) -> Vec<Picture> {
    if pictures.is_empty() {
        return Vec::new();
    }
    let folders = Folders::new(pictures, items.values().flat_map(videos_of));
    let films = items.values().filter(|item| item.kind != Kind::Episode);
    let mut found: Vec<Picture> = films.flat_map(|item| film_rows(&folders, item)).collect();
    let episodes = episodes_by_show(items);
    for show in shows.values() {
        if let Some(episodes) = episodes.get(show.id.as_str()) {
            let subject = Subject {
                kind: SHOW,
                id: &show.id,
                library: &show.library,
            };
            found.extend(rows(&subject, show_art(&folders, episodes)));
        }
    }
    found
}

fn episodes_by_show(items: &HashMap<String, MediaItem>) -> HashMap<&str, Vec<PathBuf>> {
    let mut episodes: HashMap<&str, Vec<PathBuf>> = HashMap::new();
    for item in items.values().filter(|item| item.kind == Kind::Episode) {
        if let Some(show) = item.show_id.as_deref() {
            episodes.entry(show).or_default().extend(videos_of(item));
        }
    }
    episodes
}

fn film_rows(folders: &Folders, item: &MediaItem) -> Vec<Picture> {
    let videos: Vec<PathBuf> = videos_of(item).collect();
    let subject = Subject {
        kind: ITEM,
        id: &item.id,
        library: &item.library,
    };
    rows(&subject, film_art(folders, &videos))
}

fn videos_of(item: &MediaItem) -> impl Iterator<Item = PathBuf> + '_ {
    item.files
        .iter()
        .filter_map(|file| file.abs_path.as_deref())
        .map(PathBuf::from)
}

fn rows(subject: &Subject<'_>, art: Art) -> Vec<Picture> {
    [(POSTER, art.poster), (BACKDROP, art.backdrop)]
        .into_iter()
        .filter_map(|(role, path)| picture(subject, role, path?))
        .collect()
}

fn picture(subject: &Subject<'_>, role: &'static str, path: PathBuf) -> Option<Picture> {
    let name = beside_name(&path)?;
    Some(Picture {
        subject_kind: subject.kind,
        subject_id: subject.id.to_string(),
        library: subject.library.to_string(),
        role,
        path: path.to_string_lossy().into_owned(),
        url: format!("{PUBLIC_PREFIX}{name}"),
    })
}
