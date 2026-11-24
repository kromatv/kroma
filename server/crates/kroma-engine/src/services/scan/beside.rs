use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};

use crate::db::art_beside::{season_id, Picture, BACKDROP, LOGO, POSTER, SEASON, STILL};
use crate::db::metadata_core::{ITEM, SHOW};
use crate::db::text_beside::Nfo;
use crate::infra::image::{beside_name, PUBLIC_PREFIX};
use crate::infra::nfo;
use crate::model::{Kind, MediaItem, Show};
use crate::services::art_beside::nfo::{episode_nfo, film_nfo, show_nfo};
use crate::services::art_beside::{
    episode_art, film_art, season_poster, show_art, Art, Folders, SeasonVideos,
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
    seasons: Seasons,
}

struct Owner<'a> {
    kind: &'static str,
    id: String,
    library: &'a str,
}

impl Subject<'_> {
    fn owner(&self) -> Owner<'_> {
        Owner {
            kind: self.kind(),
            id: self.id.to_string(),
            library: self.library,
        }
    }

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
        let seasons = episodes.remove(show.id.as_str())?;
        Some(Subject {
            what: What::Show,
            id: &show.id,
            library: &show.library,
            videos: seasons.values().flatten().cloned().collect(),
            seasons,
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
        seasons: BTreeMap::new(),
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
    subjects
        .iter()
        .flat_map(|s| rows(s, art(s)).into_iter().chain(season_rows(&folders, s)))
        .collect()
}

pub(super) fn nfos_beside(subjects: &[Subject<'_>], nfos: Vec<PathBuf>) -> Vec<Nfo> {
    if nfos.is_empty() {
        return Vec::new();
    }
    let folders = Folders::new(nfos, every_video(subjects));
    let file = |subject: &Subject<'_>| match subject.what {
        What::Film => film_nfo(&folders, &subject.videos),
        What::Show => show_nfo(&folders, &subject.videos),
        What::Episode => episode_nfo(&folders, &subject.videos),
    };
    subjects
        .iter()
        .filter_map(|s| Some(nfo_row(s, &file(s)?)))
        .collect()
}

fn every_video<'a>(subjects: &'a [Subject<'_>]) -> impl Iterator<Item = PathBuf> + 'a {
    subjects.iter().flat_map(|s| s.videos.iter().cloned())
}

type Seasons = BTreeMap<u32, Vec<PathBuf>>;

fn episodes_by_show(items: &HashMap<String, MediaItem>) -> HashMap<&str, Seasons> {
    let mut episodes: HashMap<&str, Seasons> = HashMap::new();
    for item in items.values().filter(|item| item.kind == Kind::Episode) {
        if let Some(show) = item.show_id.as_deref() {
            let season = episodes.entry(show).or_default();
            let videos = season.entry(item.season.unwrap_or(0)).or_default();
            videos.extend(videos_of(item));
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
    let owner = subject.owner();
    kept.into_iter()
        .filter_map(|(role, path)| picture(&owner, role, path?))
        .collect()
}

fn season_rows(folders: &Folders, show: &Subject<'_>) -> Vec<Picture> {
    let poster = |(number, videos): (&u32, &Vec<PathBuf>)| {
        let season = SeasonVideos {
            number: *number,
            videos,
        };
        let owner = Owner {
            kind: SEASON,
            id: season_id(show.id, *number),
            library: show.library,
        };
        let path = season_poster(folders, &show.videos, &season)?;
        picture(&owner, POSTER, path)
    };
    show.seasons.iter().filter_map(poster).collect()
}

fn picture(owner: &Owner<'_>, role: &'static str, path: PathBuf) -> Option<Picture> {
    let name = beside_name(&path)?;
    Some(Picture {
        subject_kind: owner.kind,
        subject_id: owner.id.clone(),
        library: owner.library.to_string(),
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
