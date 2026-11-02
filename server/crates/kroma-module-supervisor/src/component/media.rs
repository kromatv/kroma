//! The core's media tools, run on a module's behalf on the files it holds.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use kroma_media::audio::{self, Pcm, SampleFormat};
use kroma_wasm_host::{AudioDecode, Media, Preopen, SampleFormat as Asked};

use super::files::is_within;

pub(super) struct ModuleMedia {
    roots: Vec<Preopen>,
    stopping: AtomicBool,
}

fn on_host(path: &str, roots: &[Preopen]) -> PathBuf {
    let path = Path::new(path);
    roots
        .iter()
        .filter_map(|root| Some((root, path.strip_prefix(&root.guest).ok()?)))
        .max_by_key(|(root, _)| root.guest.len())
        .map_or_else(|| path.to_path_buf(), |(root, rest)| root.host.join(rest))
}

fn pcm_of(request: &AudioDecode) -> Pcm {
    Pcm {
        sample_rate: request.sample_rate,
        channels: request.channels,
        format: match request.format {
            Asked::F32le => SampleFormat::F32le,
            Asked::S16le => SampleFormat::S16le,
        },
    }
}

impl ModuleMedia {
    pub(super) fn new(roots: Vec<Preopen>) -> Self {
        Self {
            roots,
            stopping: AtomicBool::new(false),
        }
    }

    pub(super) fn stop(&self) {
        self.stopping.store(true, Ordering::Relaxed);
    }

    // ffmpeg parses what it reads with the server's rights, so it is handed only a
    // file the module cannot have written: one it holds, and in no folder it may write.
    fn source(&self, asked: &str) -> Result<PathBuf, String> {
        let path = on_host(asked, &self.roots);
        if !is_within(&path, &self.roots, false) {
            return Err(format!("{asked} is not in a folder this module holds"));
        }
        if is_within(&path, &self.roots, true) {
            return Err(format!(
                "{asked} is in a folder this module may write, and the host decodes only files it cannot change"
            ));
        }
        std::fs::canonicalize(&path).map_err(|error| format!("{asked}: {error}"))
    }

    fn destination(&self, asked: &str) -> Result<PathBuf, String> {
        let path = on_host(asked, &self.roots);
        if !is_within(&path, &self.roots, true) {
            return Err(format!("{asked} is not in a folder this module may write"));
        }
        Ok(path)
    }
}

impl Media for ModuleMedia {
    fn decode_audio(&self, request: AudioDecode) -> Result<u64, String> {
        let source = self.source(&request.source)?;
        let destination = self.destination(&request.destination)?;
        audio::decode(
            &source,
            request.track,
            pcm_of(&request),
            &destination,
            &|| self.stopping.load(Ordering::Relaxed),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn held(host: &Path, guest: &str, writable: bool) -> Preopen {
        Preopen {
            host: host.to_path_buf(),
            guest: guest.to_string(),
            writable,
        }
    }

    fn asked(source: &Path, destination: &str) -> AudioDecode {
        AudioDecode {
            source: source.to_string_lossy().into_owned(),
            track: 0,
            sample_rate: 16_000,
            channels: 1,
            format: Asked::F32le,
            destination: destination.to_string(),
        }
    }

    struct Folders {
        _dir: kroma_testing::TempDir,
        library: PathBuf,
        own: PathBuf,
        tmp: PathBuf,
        media: ModuleMedia,
    }

    fn folders(tag: &str) -> Folders {
        let dir = kroma_testing::temp_dir(tag);
        let (library, own, tmp) = (
            dir.path().join("library"),
            dir.path().join("own"),
            dir.path().join("run-tmp"),
        );
        for folder in [&library, &own, &tmp] {
            std::fs::create_dir_all(folder).unwrap();
        }
        let media = ModuleMedia::new(vec![
            held(&tmp, "/tmp", true),
            held(&own, &own.to_string_lossy(), true),
            held(&library, &library.to_string_lossy(), false),
        ]);
        Folders {
            _dir: dir,
            library,
            own,
            tmp,
            media,
        }
    }

    #[test]
    fn a_guest_path_under_tmp_lands_in_the_modules_own_scratch_folder() {
        let at = folders("media-tmp");

        let destination = at.media.destination("/tmp/pcm-1.f32le");

        assert_eq!(destination, Ok(at.tmp.join("pcm-1.f32le")));
    }

    #[test]
    fn a_source_outside_every_folder_the_module_holds_is_refused() {
        let at = folders("media-outside");

        let refused = at
            .media
            .decode_audio(asked(Path::new("/etc/hosts"), "/tmp/pcm"));

        assert!(
            refused
                .unwrap_err()
                .contains("not in a folder this module holds")
        );
    }

    #[test]
    fn a_source_the_module_may_write_is_refused_before_ffmpeg_reads_it() {
        let at = folders("media-writable");
        std::fs::write(at.own.join("crafted.wav"), b"RIFF").unwrap();

        let refused = at
            .media
            .decode_audio(asked(&at.own.join("crafted.wav"), "/tmp/pcm"));

        assert!(refused.unwrap_err().contains("may write"));
    }

    #[test]
    fn a_link_out_of_a_writable_folder_into_the_library_reads_the_library_file() {
        let at = folders("media-link");
        std::fs::write(at.library.join("film.wav"), b"RIFF").unwrap();
        std::os::unix::fs::symlink(&at.library, at.own.join("lib")).unwrap();

        let source = at
            .media
            .source(&at.own.join("lib/film.wav").to_string_lossy());

        assert_eq!(
            source,
            Ok(std::fs::canonicalize(at.library.join("film.wav")).unwrap())
        );
    }

    #[test]
    fn a_destination_outside_what_the_module_may_write_is_refused() {
        let at = folders("media-destination");
        std::fs::write(at.library.join("film.wav"), b"RIFF").unwrap();
        let into_the_library = at.library.join("pcm").to_string_lossy().into_owned();

        let refused = at
            .media
            .decode_audio(asked(&at.library.join("film.wav"), &into_the_library));

        assert!(
            refused
                .unwrap_err()
                .contains("not in a folder this module may write")
        );
        assert!(!at.library.join("pcm").exists());
    }
}
