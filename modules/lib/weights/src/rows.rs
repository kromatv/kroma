use std::io::{Read, Seek, SeekFrom};
use std::path::Path;
use std::sync::PoisonError;

use candle_core::{Device, Error, Result, Tensor};

use super::{Weights, F32_BYTES};

/// The rows of one two-dimensional f32 tensor of a safetensors file, read off
/// the file when they are asked for, so the table is never held whole.
pub struct Rows {
    weights: Weights,
    start: u64,
    height: usize,
    width: usize,
}

impl Rows {
    /// The tensor `name` of the safetensors file at `path`, refused unless it is
    /// a two-dimensional f32 table.
    pub fn open(path: &Path, name: &str) -> Result<Self> {
        let weights = Weights::open(path)?;
        let entry = weights.entries.get(name).ok_or_else(|| {
            Error::CannotFindTensor {
                path: name.to_string(),
            }
            .bt()
        })?;
        let &[height, width] = entry.shape.as_slice() else {
            return Err(Error::Msg(format!("{name} is not a table of rows")));
        };
        let (start, end) = entry.data_offsets;
        let bytes = height
            .checked_mul(width)
            .and_then(|values| values.checked_mul(F32_BYTES))
            .and_then(|bytes| u64::try_from(bytes).ok());
        if entry.dtype != "F32" || bytes != end.checked_sub(start) {
            return Err(Error::Msg(format!("{name} is not a table of f32 rows")));
        }
        Ok(Self {
            start: weights.data_start + start,
            weights,
            height,
            width,
        })
    }

    pub fn width(&self) -> usize {
        self.width
    }

    /// The rows `ids` names, in that order, as an `[ids.len(), width]` tensor.
    pub fn gather(&self, ids: &[u32], device: &Device) -> Result<Tensor> {
        let row_bytes = self.width * F32_BYTES;
        let mut values = Vec::with_capacity(ids.len() * self.width);
        let mut row = vec![0_u8; row_bytes];
        let mut file = self
            .weights
            .file
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        for &id in ids {
            let index = usize::try_from(id).map_err(Error::wrap)?;
            if index >= self.height {
                return Err(Error::Msg(format!(
                    "row {id} is past the table's {} rows",
                    self.height
                )));
            }
            let offset = u64::try_from(index * row_bytes).map_err(Error::wrap)?;
            file.seek(SeekFrom::Start(self.start + offset))?;
            file.read_exact(&mut row)?;
            let (words, _) = row.as_chunks::<F32_BYTES>();
            values.extend(words.iter().map(|word| f32::from_le_bytes(*word)));
        }
        Tensor::from_vec(values, (ids.len(), self.width), device)
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use kroma_testing::temp_dir;

    use super::*;

    fn table(path: &Path) {
        let rows = Tensor::new(&[[1_f32, 2.0], [3.0, 4.0], [5.0, 6.0]], &Device::Cpu).unwrap();
        let ids = Tensor::new(&[1_i64, 2], &Device::Cpu).unwrap();
        let tensors = HashMap::from([("table".to_string(), rows), ("ids".to_string(), ids)]);
        candle_core::safetensors::save(&tensors, path).unwrap();
    }

    #[test]
    fn gathers_the_rows_asked_for_in_the_order_asked() {
        let dir = temp_dir("rows");
        let path = dir.path().join("model.safetensors");
        table(&path);
        let rows = Rows::open(&path, "table").unwrap();

        let gathered = rows.gather(&[2, 0, 2], &Device::Cpu).unwrap();

        assert_eq!(
            gathered.to_vec2::<f32>().unwrap(),
            [[5.0, 6.0], [1.0, 2.0], [5.0, 6.0]]
        );
    }

    #[test]
    fn refuses_a_row_past_the_end_of_the_table() {
        let dir = temp_dir("rows");
        let path = dir.path().join("model.safetensors");
        table(&path);
        let rows = Rows::open(&path, "table").unwrap();

        let gathered = rows.gather(&[3], &Device::Cpu);

        assert!(gathered.is_err());
    }

    #[test]
    fn refuses_a_tensor_that_is_not_a_table_of_f32_rows() {
        let dir = temp_dir("rows");
        let path = dir.path().join("model.safetensors");
        table(&path);

        let opened = Rows::open(&path, "ids");

        assert!(opened.is_err());
    }
}
