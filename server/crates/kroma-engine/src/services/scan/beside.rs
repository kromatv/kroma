use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::db::art_beside::{Picture, BACKDROP, LOGO, POSTER};
use crate::db::metadata_core::{ITEM, SHOW};
use crate::db::text_beside::Nfo;
use crate::infra::image::{beside_name, PUBLIC_PREFIX};
use crate::infra::nfo;
use crate::model::{Kind, MediaItem, Show};
use crate::services::art_beside::{film_art, film_nfo, show_art, show_nfo, Art, Folders};

pub(super) struct Subject<'a> {
    kind: &'static str,
    id: &'a str,
    library: &'a str,
    videos: Vec<PathBuf>,
}

impl Subject<'_> {
    fn is_show(&self) -> bool {
        self.kind == SHOW
    }
}

pub(super) fn subjects<'a>(
    items: &'a HashMap<String, MediaItem>,
    shows: &'a HashMap<String, Show>,
) -> Vec<Subject<'a>> {
    let films = items.values().filter(|item| item.kind != Kind::Episode);
    let mut found: Vec<Subject<'a>> = films
        .map(|item| Subject {
            kind: ITEM,
            id: &item.id,
            library: &item.library,
            videos: videos_of(item).collect(),
        })
        .collect();
    let mut episodes = episodes_by_show(items);
    found.extend(shows.values().filter_map(|show| {
        Some(Subject {
            kind: SHOW,
            id: &show.id,
            library: &show.library,
            videos: episodes.remove(show.id.as_str())?,
        })
    }));
    found
}

pub(super) fn pictures_beside(subjects: &[Subject<'_>], pictures: Vec<PathBuf>) -> Vec<Picture> {
    if pictures.is_empty() {
        return Vec::new();
    }
    let folders = Folders::new(pictures, every_video(subjects));
    let art = |subject: &Subject<'_>| {
        if subject.is_show() {
            show_art(&folders, &subject.videos)
        } else {
            film_art(&folders, &subject.videos)
        }
    };
    subjects.iter().flat_map(|s| rows(s, art(s))).collect()
}

pub(super) fn nfos_beside(subjects: &[Subject<'_>], nfos: Vec<PathBuf>) -> Vec<Nfo> {
    if nfos.is_empty() {
        return Vec::new();
    }
    let folders = Folders::new(nfos, every_video(subjects));
    let file = |subject: &Subject<'_>| {
        if subject.is_show() {
            show_nfo(&folders, &subject.videos)
        } else {
            film_nfo(&folders, &subject.videos)
        }
    };
    subjects
        .iter()
        .filter_map(|s| Some(nfo_row(s, &file(s)?)))
        .collect()
}

fn every_video<'a>(subjects: &'a [Subject<'_>]) -> impl Iterator<Item = PathBuf> + 'a {
    subjects.iter().flat_map(|s| s.videos.iter().cloned())
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

fn videos_of(item: &MediaItem) -> impl Iterator<Item = PathBuf> + '_ {
    item.files
        .iter()
        .filter_map(|file| file.abs_path.as_deref())
        .map(PathBuf::from)
}

fn rows(subject: &Subject<'_>, art: Art) -> Vec<Picture> {
    let kept = [
        (POSTER, art.poster),
        (BACKDROP, art.backdrop),
        (LOGO, art.logo),
    ];
    kept.into_iter()
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

fn nfo_row(subject: &Subject<'_>, path: &Path) -> Nfo {
    Nfo {
        subject_kind: subject.kind,
        subject_id: subject.id.to_string(),
        library: subject.library.to_string(),
        path: path.to_string_lossy().into_owned(),
        modified: nfo::modified(path),
    }
}
