use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::db::art_beside::{Picture, BACKDROP, LOGO, POSTER, STILL};
use crate::db::metadata_core::{ITEM, SHOW};
use crate::db::text_beside::Nfo;
use crate::infra::image::{beside_name, PUBLIC_PREFIX};
use crate::infra::nfo;
use crate::model::{Kind, MediaItem, Show};
use crate::services::art_beside::{
    episode_art, film_art, film_nfo, show_art, show_nfo, Art, Folders,
};

#[derive(Clone, Copy, PartialEq, Eq)]
enum What {
    Film,
    Show,
    Episode,
}

pub(super) struct Subject<'a> {
    what: What,
    id: &'a str,
    library: &'a str,
    videos: Vec<PathBuf>,
}

impl Subject<'_> {
    fn kind(&self) -> &'static str {
        if self.what == What::Show {
            SHOW
        } else {
            ITEM
        }
    }
}

pub(super) fn subjects<'a>(
    items: &'a HashMap<String, MediaItem>,
    shows: &'a HashMap<String, Show>,
) -> Vec<Subject<'a>> {
    let mut found: Vec<Subject<'a>> = items.values().map(item_subject).collect();
    let mut episodes = episodes_by_show(items);
    found.extend(shows.values().filter_map(|show| {
        Some(Subject {
            what: What::Show,
            id: &show.id,
            library: &show.library,
            videos: episodes.remove(show.id.as_str())?,
        })
    }));
    found
}

fn item_subject(item: &MediaItem) -> Subject<'_> {
    let what = if item.kind == Kind::Episode {
        What::Episode
    } else {
        What::Film
    };
    Subject {
        what,
        id: &item.id,
        library: &item.library,
        videos: videos_of(item).collect(),
    }
}

pub(super) fn pictures_beside(subjects: &[Subject<'_>], pictures: Vec<PathBuf>) -> Vec<Picture> {
    if pictures.is_empty() {
        return Vec::new();
    }
    let folders = Folders::new(pictures, every_video(subjects));
    let art = |subject: &Subject<'_>| match subject.what {
        What::Film => film_art(&folders, &subject.videos),
        What::Show => show_art(&folders, &subject.videos),
        What::Episode => episode_art(&folders, &subject.videos),
    };
    subjects.iter().flat_map(|s| rows(s, art(s))).collect()
}

pub(super) fn nfos_beside(subjects: &[Subject<'_>], nfos: Vec<PathBuf>) -> Vec<Nfo> {
    if nfos.is_empty() {
        return Vec::new();
    }
    let folders = Folders::new(nfos, every_video(subjects));
    let file = |subject: &Subject<'_>| match subject.what {
        What::Film => film_nfo(&folders, &subject.videos),
        What::Show => show_nfo(&folders, &subject.videos),
        What::Episode => None,
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
        (STILL, art.still),
    ];
    kept.into_iter()
        .filter_map(|(role, path)| picture(subject, role, path?))
        .collect()
}

fn picture(subject: &Subject<'_>, role: &'static str, path: PathBuf) -> Option<Picture> {
    let name = beside_name(&path)?;
    Some(Picture {
        subject_kind: subject.kind(),
        subject_id: subject.id.to_string(),
        library: subject.library.to_string(),
        role,
        path: path.to_string_lossy().into_owned(),
        url: format!("{PUBLIC_PREFIX}{name}"),
    })
}

fn nfo_row(subject: &Subject<'_>, path: &Path) -> Nfo {
    Nfo {
        subject_kind: subject.kind(),
        subject_id: subject.id.to_string(),
        library: subject.library.to_string(),
        path: path.to_string_lossy().into_owned(),
        modified: nfo::modified(path),
    }
}
