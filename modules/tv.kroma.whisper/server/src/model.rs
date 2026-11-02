use std::path::{Path, PathBuf};

use kroma_module_sdk::pinned::{self, PinnedFile};

mod pins;

use pins::{Model, MODELS, TOKENIZER};

const MAX_DOWNLOAD_SECS: u32 = 1800;

impl Model {
    fn files(&self) -> [PinnedFile<'static>; 3] {
        [
            PinnedFile {
                name: "config.json",
                sha256: self.config,
            },
            PinnedFile {
                name: "tokenizer.json",
                sha256: TOKENIZER,
            },
            PinnedFile {
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
    let download = pinned::download("model-download", MAX_DOWNLOAD_SECS);
    model
        .files()
        .iter()
        .all(|file| pinned::ensure(&dir, file, &url(model, file), &download))
        .then_some(dir)
}

fn url(model: &Model, file: &PinnedFile<'_>) -> String {
    format!(
        "https://huggingface.co/{}/resolve/{}/{}?download=true",
        model.spec, model.revision, file.name
    )
}

#[cfg(test)]
mod tests {
    use kroma_module_sdk::testing::temp_dir;

    use super::*;

    fn leftovers(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = std::fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
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
