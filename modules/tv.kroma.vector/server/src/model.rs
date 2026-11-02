use std::path::{Path, PathBuf};

use kroma_module_sdk::pinned::{self, PinnedFile};

const SPEC: &str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2";
const REVISION: &str = "e8f8c211226b894fcb81acc59f3b34ba3efd5f42";
const MAX_DOWNLOAD_SECS: u32 = 3600;

const FILES: [PinnedFile<'static>; 3] = [
    PinnedFile {
        name: "config.json",
        sha256: "6300193cb75e01cf80c96decef7187dfb33094d97cc1490b7ead6ff134476e4e",
    },
    PinnedFile {
        name: "tokenizer.json",
        sha256: "2c3387be76557bd40970cec13153b3bbf80407865484b209e655e5e4729076b8",
    },
    PinnedFile {
        name: "model.safetensors",
        sha256: "eaa086f0ffee582aeb45b36e34cdd1fe2d6de2bef61f8a559a1bbc9bd955917b",
    },
];

pub(crate) struct Place {
    pub(crate) dir: PathBuf,
    pub(crate) downloads: bool,
}

pub(crate) fn place() -> Place {
    if let Some(dir) = std::env::var_os("KROMA_EMBED_MODEL_DIR") {
        return Place {
            dir: dir.into(),
            downloads: false,
        };
    }
    if let Some(data) = std::env::var_os("KROMA_DATA_DIR") {
        return Place {
            dir: PathBuf::from(data).join("models").join("ml-minilm"),
            downloads: true,
        };
    }
    Place {
        dir: PathBuf::from("models/ml-minilm"),
        downloads: false,
    }
}

pub(crate) fn present(dir: &Path) -> bool {
    FILES.iter().all(|file| dir.join(file.name).is_file())
}

pub(crate) fn fetch(dir: &Path) -> bool {
    if std::fs::create_dir_all(dir).is_err() {
        return false;
    }
    let download = pinned::download("model-download", MAX_DOWNLOAD_SECS);
    FILES
        .iter()
        .all(|file| pinned::ensure(dir, file, &url(file), &download))
}

fn url(file: &PinnedFile<'_>) -> String {
    format!("https://huggingface.co/{SPEC}/resolve/{REVISION}/{}?download=true", file.name)
}

#[cfg(test)]
mod tests {
    use kroma_module_sdk::testing::temp_dir;

    use super::*;

    #[test]
    fn downloads_from_the_pinned_revision_and_never_from_main() {
        let address = url(&FILES[2]);

        assert_eq!(
            address,
            "https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2/resolve/e8f8c211226b894fcb81acc59f3b34ba3efd5f42/model.safetensors?download=true"
        );
    }

    #[test]
    fn a_folder_holding_all_three_files_has_the_model() {
        let dir = temp_dir("vector-model");
        for file in &FILES {
            std::fs::write(dir.path().join(file.name), "x").unwrap();
        }

        assert!(present(dir.path()));
    }

    #[test]
    fn a_folder_still_waiting_for_its_weights_has_no_model() {
        let dir = temp_dir("vector-model");
        std::fs::write(dir.path().join("config.json"), "{}").unwrap();
        std::fs::write(dir.path().join("tokenizer.json"), "{}").unwrap();
        std::fs::write(dir.path().join("model.safetensors.part"), "x").unwrap();

        assert!(!present(dir.path()));
    }

    #[test]
    fn pins_every_file_to_a_sha256() {
        let is_hex = |s: &str| s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b));

        assert_eq!(REVISION.len(), 40);
        assert!(is_hex(REVISION));
        assert!(FILES.iter().all(|file| file.sha256.len() == 64 && is_hex(file.sha256)));
    }
}
