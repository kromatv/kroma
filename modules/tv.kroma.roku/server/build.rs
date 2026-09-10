//! Packs `../channel/` (the BrightScript source tree) and `../locales/` (the
//! module's catalogs, which the channel reads on the box) into the zip a Roku's
//! developer installer accepts, so the sidecar carries the channel it installs.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

fn main() {
    let module = Path::new(env!("CARGO_MANIFEST_DIR")).join("..");
    let out = PathBuf::from(std::env::var("OUT_DIR").unwrap()).join("channel.zip");
    let mut entries = Vec::new();
    collect(&module.join("channel"), "", &mut entries);
    collect(&module.join("locales"), "locales/", &mut entries);
    entries.sort();

    let mut zip = ZipWriter::new(fs::File::create(&out).unwrap());
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    for (name, path) in &entries {
        zip.start_file(name.as_str(), options).unwrap();
        zip.write_all(&fs::read(path).unwrap()).unwrap();
        println!("cargo:rerun-if-changed={}", path.display());
    }
    zip.finish().unwrap();
}

fn collect(dir: &Path, prefix: &str, into: &mut Vec<(String, PathBuf)>) {
    println!("cargo:rerun-if-changed={}", dir.display());
    for entry in fs::read_dir(dir).unwrap() {
        let path = entry.unwrap().path();
        let Some(name) = path.file_name().map(|n| n.to_string_lossy().into_owned()) else {
            continue;
        };
        if path.is_dir() {
            collect(&path, &format!("{prefix}{name}/"), into);
        } else if name != ".DS_Store" {
            into.push((format!("{prefix}{name}"), path));
        }
    }
}
