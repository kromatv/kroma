//! Model weights read off a safetensors file one tensor at a time.

use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;
use std::sync::{Mutex, PoisonError};

use candle_core::{DType, Device, Error, Result, Shape, Tensor};
use candle_nn::var_builder::SimpleBackend;
use candle_nn::{Init, VarBuilder};
use serde::Deserialize;

mod rows;

pub use rows::Rows;

const HEADER_LENGTH_BYTES: u64 = 8;
const METADATA_KEY: &str = "__metadata__";
const READ_CHUNK: usize = 1024 * 1024;
const F32_BYTES: usize = size_of::<f32>();

#[derive(Deserialize)]
struct Entry {
    dtype: String,
    shape: Vec<usize>,
    data_offsets: (u64, u64),
}

struct Weights {
    file: Mutex<File>,
    data_start: u64,
    entries: HashMap<String, Entry>,
}

fn dtype_of(name: &str) -> Result<DType> {
    match name {
        "U8" => Ok(DType::U8),
        "U32" => Ok(DType::U32),
        "I32" => Ok(DType::I32),
        "I64" => Ok(DType::I64),
        "BF16" => Ok(DType::BF16),
        "F16" => Ok(DType::F16),
        "F32" => Ok(DType::F32),
        "F64" => Ok(DType::F64),
        other => Err(Error::Msg(format!("a tensor of unknown type {other}"))),
    }
}

fn read_f32(file: &mut File, bytes: u64) -> Result<Vec<f32>> {
    let bytes = usize::try_from(bytes).map_err(Error::wrap)?;
    let mut values = Vec::with_capacity(bytes / F32_BYTES);
    let mut chunk = vec![0_u8; READ_CHUNK.min(bytes)];
    let mut left = bytes;
    while left > 0 {
        let take = left.min(READ_CHUNK);
        file.read_exact(&mut chunk[..take])?;
        let (words, _) = chunk[..take].as_chunks::<F32_BYTES>();
        values.extend(words.iter().map(|word| f32::from_le_bytes(*word)));
        left -= take;
    }
    Ok(values)
}

impl Weights {
    fn open(path: &Path) -> Result<Self> {
        let mut file = File::open(path)?;
        let mut length = [0_u8; HEADER_LENGTH_BYTES as usize];
        file.read_exact(&mut length)?;
        let length = u64::from_le_bytes(length);
        let mut header = vec![0_u8; usize::try_from(length).map_err(Error::wrap)?];
        file.read_exact(&mut header)?;
        let mut raw: HashMap<String, serde_json::Value> =
            serde_json::from_slice(&header).map_err(Error::wrap)?;
        raw.remove(METADATA_KEY);
        let entries = raw
            .into_iter()
            .map(|(name, entry)| Ok((name, serde_json::from_value(entry).map_err(Error::wrap)?)))
            .collect::<Result<_>>()?;
        Ok(Self {
            file: Mutex::new(file),
            data_start: HEADER_LENGTH_BYTES + length,
            entries,
        })
    }

    fn load(&self, name: &str, device: &Device) -> Result<Tensor> {
        let entry = self
            .entries
            .get(name)
            .ok_or_else(|| Error::CannotFindTensor { path: name.to_string() }.bt())?;
        let (start, end) = entry.data_offsets;
        let bytes = end.checked_sub(start).ok_or_else(|| Error::Msg(format!("{name} ends before it starts")))?;
        let shape = Shape::from(entry.shape.clone());
        let mut file = self.file.lock().unwrap_or_else(PoisonError::into_inner);
        file.seek(SeekFrom::Start(self.data_start + start))?;
        let dtype = dtype_of(&entry.dtype)?;
        if dtype == DType::F32 {
            return Tensor::from_vec(read_f32(&mut file, bytes)?, shape, device);
        }
        let mut raw = vec![0_u8; usize::try_from(bytes).map_err(Error::wrap)?];
        file.read_exact(&mut raw)?;
        Tensor::from_raw_buffer(&raw, dtype, shape.dims(), device)
    }
}

impl SimpleBackend for Weights {
    fn get(&self, s: Shape, name: &str, _: Init, dtype: DType, dev: &Device) -> Result<Tensor> {
        let tensor = self.load(name, dev)?.to_dtype(dtype)?;
        if tensor.shape() != &s {
            return Err(Error::UnexpectedShape {
                msg: format!("shape mismatch for {name}"),
                expected: s,
                got: tensor.shape().clone(),
            }
            .bt());
        }
        Ok(tensor)
    }

    fn get_unchecked(&self, name: &str, dtype: DType, dev: &Device) -> Result<Tensor> {
        self.load(name, dev)?.to_dtype(dtype)
    }

    fn contains_tensor(&self, name: &str) -> bool {
        self.entries.contains_key(name)
    }
}

/// A [`VarBuilder`] over the safetensors file at `path`.
pub fn var_builder(path: &Path, dtype: DType, device: &Device) -> Result<VarBuilder<'static>> {
    Ok(VarBuilder::from_backend(Box::new(Weights::open(path)?), dtype, device.clone()))
}

#[cfg(test)]
mod tests {
    use kroma_testing::temp_dir;

    use super::*;

    fn saved(tensors: &[(&str, Tensor)], path: &Path) {
        let by_name: HashMap<String, Tensor> = tensors
            .iter()
            .map(|(name, tensor)| ((*name).to_string(), tensor.clone()))
            .collect();
        candle_core::safetensors::save(&by_name, path).unwrap();
    }

    #[test]
    fn reads_each_tensor_as_the_file_holds_it() {
        let dir = temp_dir("weights");
        let path = dir.path().join("model.safetensors");
        let first = Tensor::new(&[[1_f32, 2.0], [3.0, 4.0]], &Device::Cpu).unwrap();
        let second = Tensor::new(&[5_f32, 6.0, 7.0], &Device::Cpu).unwrap();
        saved(&[("first", first), ("second", second)], &path);

        let vb = var_builder(&path, DType::F32, &Device::Cpu).unwrap();

        assert_eq!(
            vb.get((2, 2), "first").unwrap().to_vec2::<f32>().unwrap(),
            [[1.0, 2.0], [3.0, 4.0]]
        );
        assert_eq!(
            vb.get(3, "second").unwrap().to_vec1::<f32>().unwrap(),
            [5.0, 6.0, 7.0]
        );
    }

    #[test]
    fn converts_a_tensor_of_another_type_to_the_one_asked_for() {
        let dir = temp_dir("weights");
        let path = dir.path().join("model.safetensors");
        let ids = Tensor::new(&[1_i64, 2, 3], &Device::Cpu).unwrap();
        saved(&[("ids", ids)], &path);

        let vb = var_builder(&path, DType::F32, &Device::Cpu).unwrap();

        assert_eq!(
            vb.get(3, "ids").unwrap().to_vec1::<f32>().unwrap(),
            [1.0, 2.0, 3.0]
        );
    }

    #[test]
    fn refuses_a_tensor_of_another_shape() {
        let dir = temp_dir("weights");
        let path = dir.path().join("model.safetensors");
        let first = Tensor::new(&[1_f32, 2.0], &Device::Cpu).unwrap();
        saved(&[("first", first)], &path);

        let vb = var_builder(&path, DType::F32, &Device::Cpu).unwrap();

        assert!(vb.get(3, "first").is_err());
    }

    #[test]
    fn says_which_tensors_the_file_holds() {
        let dir = temp_dir("weights");
        let path = dir.path().join("model.safetensors");
        let first = Tensor::new(&[1_f32], &Device::Cpu).unwrap();
        saved(&[("first", first)], &path);

        let vb = var_builder(&path, DType::F32, &Device::Cpu).unwrap();

        assert!(vb.contains_tensor("first"));
        assert!(!vb.contains_tensor("absent"));
        assert!(vb.get(1, "absent").is_err());
    }

    #[test]
    fn refuses_a_file_that_is_not_safetensors() {
        let dir = temp_dir("weights");
        let path = dir.path().join("model.safetensors");
        std::fs::write(&path, "nope").unwrap();

        let opened = var_builder(&path, DType::F32, &Device::Cpu);

        assert!(opened.is_err());
    }
}
