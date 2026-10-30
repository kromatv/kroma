use std::path::{Path, PathBuf};

use kroma_module_sdk::http::Fetch;
use kroma_module_sdk::primitives::sha256_file;

mod pins;

use pins::{Model, MODELS, TOKENIZER};

const MAX_DOWNLOAD_SECS: u32 = 1800;

struct File {
    name: &'static str,
    sha256: &'static str,
}

impl Model {
    fn files(&self) -> [File; 3] {
        [
            File {
                name: "config.json",
                sha256: self.config,
            },
            File {
                name: "tokenizer.json",
                sha256: TOKENIZER,
            },
            File {
                name: "model.safetensors",
                sha256: self.weights,
            },
        ]
    }
}

pub(crate) fn resolve(data_dir: &Path, spec: &str) -> Option<PathBuf> {
    let spec = spec.trim();
    let local = Path::new(spec);
    if local.join("config.json").exists() && local.join("tokenizer.json").exists() {
        return Some(local.to_path_buf());
    }
    let model = MODELS.iter().find(|m| m.spec == spec)?;
    let dir = data_dir.join("whisper").join(spec.replace('/', "_"));
    std::fs::create_dir_all(&dir).ok()?;
    model
        .files()
        .iter()
        .all(|file| ensure(&dir, file, &url(model, file), &download))
        .then_some(dir)
}

fn url(model: &Model, file: &File) -> String {
    format!(
        "https://huggingface.co/{}/resolve/{}/{}?download=true",
        model.spec, model.revision, file.name
    )
}

fn ensure(dir: &Path, file: &File, url: &str, fetch: &dyn Fn(&str, &Path) -> bool) -> bool {
    let dest = dir.join(file.name);
    if hashes_to(&dest, file.sha256) {
        return true;
    }
    let _ = std::fs::remove_file(&dest);
    let part = dir.join(format!("{}.part", file.name));
    if !fetch(url, &part) || !hashes_to(&part, file.sha256) {
        let _ = std::fs::remove_file(&part);
        return false;
    }
    std::fs::rename(&part, &dest).is_ok()
}

fn hashes_to(path: &Path, sha256: &str) -> bool {
    sha256_file(path).is_ok_and(|actual| actual == sha256)
}

fn download(url: &str, dest: &Path) -> bool {
    Fetch::new()
        .purpose("model-download")
        .max_time(MAX_DOWNLOAD_SECS)
        .download(url, dest)
        .is_ok_and(|response| (200..300).contains(&response.status))
}

#[cfg(test)]
mod tests {
    use std::cell::{Cell, RefCell};

    use kroma_module_sdk::testing::temp_dir;

    use super::*;

    const ABC_SHA256: &str = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

    const PINNED_TO_ABC: File = File {
        name: "model.safetensors",
        sha256: ABC_SHA256,
    };

    struct Origin {
        body: &'static [u8],
        asked: RefCell<Vec<String>>,
        works: Cell<bool>,
    }

    impl Origin {
        fn serving(body: &'static [u8]) -> Self {
            Self {
                body,
                asked: RefCell::default(),
                works: Cell::new(true),
            }
        }

        fn down() -> Self {
            let origin = Self::serving(b"");
            origin.works.set(false);
            origin
        }

        fn fetch(&self, url: &str, dest: &Path) -> bool {
            self.asked.borrow_mut().push(url.to_string());
            self.works.get() && std::fs::write(dest, self.body).is_ok()
        }
    }

    fn leftovers(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = std::fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    #[test]
    fn keeps_a_file_that_matches_its_pin_without_fetching() {
        let dir = temp_dir("whisper-model");
        std::fs::write(dir.path().join(PINNED_TO_ABC.name), "abc").unwrap();
        let origin = Origin::serving(b"abc");

        let kept = ensure(dir.path(), &PINNED_TO_ABC, "u", &|u, d| origin.fetch(u, d));

        assert!(kept);
        assert!(origin.asked.borrow().is_empty());
    }

    #[test]
    fn installs_a_download_that_matches_its_pin() {
        let dir = temp_dir("whisper-model");
        let origin = Origin::serving(b"abc");

        let installed = ensure(dir.path(), &PINNED_TO_ABC, "u", &|u, d| origin.fetch(u, d));

        assert!(installed);
        assert_eq!(leftovers(dir.path()), ["model.safetensors"]);
    }

    #[test]
    fn downloads_again_over_a_file_cut_short() {
        let dir = temp_dir("whisper-model");
        std::fs::write(dir.path().join(PINNED_TO_ABC.name), "ab").unwrap();
        let origin = Origin::serving(b"abc");

        let repaired = ensure(dir.path(), &PINNED_TO_ABC, "u", &|u, d| origin.fetch(u, d));

        assert!(repaired);
        assert_eq!(
            std::fs::read(dir.path().join(PINNED_TO_ABC.name)).unwrap(),
            b"abc"
        );
    }

    #[test]
    fn deletes_a_download_with_other_bytes() {
        let dir = temp_dir("whisper-model");
        let origin = Origin::serving(b"abd");

        let installed = ensure(dir.path(), &PINNED_TO_ABC, "u", &|u, d| origin.fetch(u, d));

        assert!(!installed);
        assert!(leftovers(dir.path()).is_empty());
    }

    #[test]
    fn deletes_a_download_that_stops_early() {
        let dir = temp_dir("whisper-model");
        let origin = Origin::serving(b"ab");

        let installed = ensure(dir.path(), &PINNED_TO_ABC, "u", &|u, d| origin.fetch(u, d));

        assert!(!installed);
        assert!(leftovers(dir.path()).is_empty());
    }

    #[test]
    fn deletes_a_bad_file_even_when_the_download_fails() {
        let dir = temp_dir("whisper-model");
        std::fs::write(dir.path().join(PINNED_TO_ABC.name), "ab").unwrap();
        let origin = Origin::down();

        let installed = ensure(dir.path(), &PINNED_TO_ABC, "u", &|u, d| origin.fetch(u, d));

        assert!(!installed);
        assert!(leftovers(dir.path()).is_empty());
    }

    #[test]
    fn downloads_from_the_pinned_revision_and_never_from_main() {
        let model = &MODELS[0];

        let address = url(model, &model.files()[0]);

        assert_eq!(
            address,
            "https://huggingface.co/openai/whisper-tiny/resolve/169d4a4341b33bc18d8881c4b69c2e104e1cc0af/config.json?download=true"
        );
    }

    #[test]
    fn uses_a_local_directory_that_holds_a_model() {
        let data = temp_dir("whisper-data");
        let local = temp_dir("whisper-local");
        std::fs::write(local.path().join("config.json"), "{}").unwrap();
        std::fs::write(local.path().join("tokenizer.json"), "{}").unwrap();

        let dir = resolve(data.path(), local.path().to_str().unwrap());

        assert_eq!(dir.as_deref(), Some(local.path()));
    }

    #[test]
    fn refuses_to_download_a_repository_with_no_pin() {
        let data = temp_dir("whisper-data");

        let dir = resolve(data.path(), "someone/else-model");

        assert_eq!(dir, None);
        assert!(leftovers(data.path()).is_empty());
    }

    #[test]
    fn pins_the_three_models_the_server_asks_for() {
        let specs: Vec<_> = MODELS.iter().map(|m| m.spec).collect();

        assert_eq!(
            specs,
            [
                "openai/whisper-tiny",
                "openai/whisper-base",
                "openai/whisper-small"
            ]
        );
    }

    #[test]
    fn pins_every_model_to_a_commit_and_every_file_to_a_sha256() {
        let is_hex = |s: &str| {
            s.bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        };

        for model in MODELS {
            assert_eq!(model.revision.len(), 40, "{}", model.spec);
            assert!(is_hex(model.revision), "{}", model.spec);
            for file in &model.files() {
                assert_eq!(file.sha256.len(), 64, "{} {}", model.spec, file.name);
                assert!(is_hex(file.sha256), "{} {}", model.spec, file.name);
            }
        }
    }
}
