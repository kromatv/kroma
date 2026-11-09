use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{self, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use anyhow::{anyhow, bail, Context, Result};
use serde::Serialize;

use crate::innertube::{self, Format, Player, Refused};
use crate::profiles::{Client, Profiles, REMOTE};
use crate::web::{Live, Web};
use crate::{mp4, pick, MODULE_ID};

const MAX_SECONDS: u64 = 15 * 60;
const MAX_STREAM_BYTES: u64 = 1024 * 1024 * 1024;
const CHUNK_BYTES: u64 = 10 * 1024 * 1024;
const CHUNK_ATTEMPTS: usize = 3;
const VISITOR_FOR: Duration = Duration::from_secs(6 * 60 * 60);
const STALE_WORK: Duration = Duration::from_secs(60 * 60);
const TRAILER_FILE: &str = "trailer.mp4";

/// The most bytes one [`Trailers::read`] hands back.
pub const MAX_READ: u64 = 8 * 1024 * 1024;

/// A YouTube video id: eleven letters, digits, `-` or `_`, so it is also a
/// safe folder name.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VideoId(String);

impl VideoId {
    pub fn parse(raw: &str) -> Result<Self> {
        let valid = raw.len() == 11
            && raw
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
        if !valid {
            bail!("{raw:?} is not a YouTube video id");
        }
        Ok(Self(raw.to_string()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for VideoId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

/// What a finished fetch left on disk, as the `trailer/fetch` point answers it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Fetched {
    pub bytes: u64,
    pub duration_ms: u64,
    pub width: u32,
    pub height: u32,
    pub client: String,
}

/// Fetches one trailer at a time into the module's own folder, and serves the
/// finished file back in slices.
pub struct Trailers {
    web: Arc<dyn Web>,
    profiles: Profiles,
    visitors: Mutex<HashMap<String, (String, Instant)>>,
    work: PathBuf,
    chunk_bytes: u64,
}

impl Trailers {
    pub fn new(data_dir: &Path) -> Self {
        Self::with(
            Arc::new(Live),
            data_dir.join("modules").join(MODULE_ID).join("work"),
            CHUNK_BYTES,
        )
    }

    pub(crate) fn with(web: Arc<dyn Web>, work: PathBuf, chunk_bytes: u64) -> Self {
        Self {
            web,
            profiles: Profiles::built_in(),
            visitors: Mutex::new(HashMap::new()),
            work,
            chunk_bytes,
        }
    }

    pub fn fetch(&self, video: &VideoId, max_height: u32) -> Result<Fetched> {
        let dir = self.work.join(video.as_str());
        self.sweep(&dir);
        fs::create_dir_all(&dir).context("create the working folder")?;
        let remote = || self.web.profiles(REMOTE);
        let mut failures = Vec::new();
        let clients = self.profiles.clients(Instant::now(), remote);
        if let Some(found) = self.first_working(&clients, video, max_height, &dir, &mut failures) {
            return Ok(found);
        }
        if self.profiles.refresh_after_failure(Instant::now(), remote) {
            let clients = self.profiles.clients(Instant::now(), remote);
            if let Some(found) =
                self.first_working(&clients, video, max_height, &dir, &mut failures)
            {
                return Ok(found);
            }
        }
        let _ = fs::remove_dir_all(&dir);
        bail!("no client could fetch {video}: {}", failures.join("; "))
    }

    pub fn read(&self, video: &VideoId, offset: u64, length: u64) -> Result<Vec<u8>> {
        let mut file = File::open(self.work.join(video.as_str()).join(TRAILER_FILE))
            .with_context(|| format!("{video} has not been fetched"))?;
        let size = file.metadata()?.len();
        if offset > size {
            bail!("{offset} is past the end of {video}");
        }
        let length = length.min(MAX_READ).min(size - offset);
        file.seek(SeekFrom::Start(offset))?;
        let mut out = vec![0u8; length as usize];
        file.read_exact(&mut out)?;
        Ok(out)
    }

    pub fn forget(&self, video: &VideoId) -> Result<()> {
        let dir = self.work.join(video.as_str());
        if dir.exists() {
            fs::remove_dir_all(&dir)?;
        }
        Ok(())
    }

    fn first_working(
        &self,
        clients: &[Client],
        video: &VideoId,
        max_height: u32,
        dir: &Path,
        failures: &mut Vec<String>,
    ) -> Option<Fetched> {
        for client in clients {
            let started = Instant::now();
            match self.with_client(client, video, max_height, dir) {
                Ok(fetched) => {
                    self.profiles.worked(&client.name);
                    tracing::info!(
                        "trailer {video} ready through {} in {:.1} s ({} bytes, {}p)",
                        client.name,
                        started.elapsed().as_secs_f32(),
                        fetched.bytes,
                        fetched.height
                    );
                    return Some(fetched);
                }
                Err(error) => {
                    tracing::warn!("trailer {video} failed through {}: {error:#}", client.name);
                    failures.push(format!("{}: {error:#}", client.name));
                }
            }
        }
        None
    }

    fn with_client(
        &self,
        client: &Client,
        video: &VideoId,
        max_height: u32,
        dir: &Path,
    ) -> Result<Fetched> {
        let player = self.player(client, video)?;
        let length = player.length_seconds();
        if player.video_details.is_live_content || length > MAX_SECONDS {
            bail!("a video of {length} s is not a trailer");
        }
        let formats = &player.streaming_data.adaptive_formats;
        let picture =
            pick::video(formats, max_height).ok_or_else(|| anyhow!("no H.264 picture to take"))?;
        let sound = pick::audio(formats).ok_or_else(|| anyhow!("no original AAC track to take"))?;
        let video_path = dir.join("video.mp4");
        let audio_path = dir.join("audio.m4a");
        self.download(picture, &client.user_agent, &video_path, dir)?;
        self.download(sound, &client.user_agent, &audio_path, dir)?;
        let remuxed = mp4::remux(&video_path, &audio_path, &dir.join(TRAILER_FILE))?;
        let _ = fs::remove_file(&video_path);
        let _ = fs::remove_file(&audio_path);
        Ok(Fetched {
            bytes: remuxed.bytes,
            duration_ms: remuxed.duration_ms,
            width: remuxed.width,
            height: remuxed.height,
            client: client.name.clone(),
        })
    }

    fn player(&self, client: &Client, video: &VideoId) -> Result<Player> {
        let visitor = self.visitor(client, false)?;
        match innertube::player(&*self.web, client, &visitor, video.as_str()) {
            Err(error)
                if matches!(error.downcast_ref::<Refused>(), Some(Refused::NeedsVisitor)) =>
            {
                let visitor = self.visitor(client, true)?;
                innertube::player(&*self.web, client, &visitor, video.as_str())
            }
            answered => answered,
        }
    }

    fn visitor(&self, client: &Client, fresh: bool) -> Result<String> {
        let now = Instant::now();
        if !fresh {
            let known = self.visitors().get(&client.name).cloned();
            if let Some((visitor, _)) =
                known.filter(|(_, at)| now.duration_since(*at) < VISITOR_FOR)
            {
                return Ok(visitor);
            }
        }
        let visitor = innertube::visitor_id(&*self.web, client)?;
        self.visitors()
            .insert(client.name.clone(), (visitor.clone(), now));
        Ok(visitor)
    }

    fn visitors(&self) -> std::sync::MutexGuard<'_, HashMap<String, (String, Instant)>> {
        self.visitors
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    fn download(&self, format: &Format, user_agent: &str, dest: &Path, dir: &Path) -> Result<()> {
        let url = format
            .url
            .as_deref()
            .ok_or_else(|| anyhow!("the format has no address"))?;
        let size = format
            .size()
            .ok_or_else(|| anyhow!("the format has no length"))?;
        if size > MAX_STREAM_BYTES {
            bail!("a stream of {size} bytes is larger than a trailer");
        }
        let separator = if url.contains('?') { '&' } else { '?' };
        let part = dir.join("part");
        let mut out = File::create(dest)?;
        let mut start = 0u64;
        while start < size {
            let end = (start + self.chunk_bytes).min(size) - 1;
            self.chunk(
                &format!("{url}{separator}range={start}-{end}"),
                user_agent,
                &part,
                end - start + 1,
            )?;
            io::copy(&mut File::open(&part)?, &mut out)?;
            start = end + 1;
        }
        let _ = fs::remove_file(&part);
        Ok(())
    }

    fn chunk(&self, url: &str, user_agent: &str, part: &Path, expected: u64) -> Result<()> {
        let mut last = anyhow!("no attempt was made");
        for _ in 0..CHUNK_ATTEMPTS {
            match self.web.download(url, user_agent, part) {
                Ok(()) => {
                    let got = fs::metadata(part)?.len();
                    if got == expected {
                        return Ok(());
                    }
                    last = anyhow!("a range of {expected} bytes came back as {got}");
                }
                Err(error) => last = error,
            }
        }
        Err(last)
    }

    fn sweep(&self, keep: &Path) {
        let Ok(entries) = fs::read_dir(&self.work) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let old = entry
                .metadata()
                .and_then(|m| m.modified())
                .ok()
                .and_then(|at| at.elapsed().ok())
                .is_some_and(|age| age > STALE_WORK);
            if path != keep && old {
                let _ = fs::remove_dir_all(&path);
            }
        }
    }
}

#[cfg(test)]
mod tests;
