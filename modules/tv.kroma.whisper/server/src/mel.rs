//! The log-mel spectrogram Whisper reads, computed frame by frame off the PCM file.

use std::f32::consts::PI;
use std::io::{self, BufReader, Read};

const N_FFT: usize = 400;
const HOP: usize = 160;
const N_FREQS: usize = N_FFT / 2 + 1;
const PADDING_FRAMES: usize = 1500;
const SAMPLE_BYTES: usize = 4;
const READ_BUFFER: usize = 1024 * 1024;

struct Fft {
    twiddles: Vec<Vec<(f32, f32)>>,
    dft_size: usize,
    dft: Vec<(f32, f32)>,
}

impl Fft {
    fn new(size: usize) -> Self {
        let two_pi = PI + PI;
        let mut twiddles = Vec::new();
        let mut n = size;
        while n.is_multiple_of(2) {
            twiddles.push(
                (0..n / 2)
                    .map(|k| {
                        let theta = two_pi * k as f32 / n as f32;
                        (theta.cos(), -theta.sin())
                    })
                    .collect(),
            );
            n /= 2;
        }
        let dft = (0..n)
            .flat_map(|k| {
                (0..n).map(move |j| {
                    let angle = two_pi * k as f32 * j as f32 / n as f32;
                    (angle.cos(), angle.sin())
                })
            })
            .collect();
        Self {
            twiddles,
            dft_size: n,
            dft,
        }
    }

    fn scratch_len(&self, size: usize) -> usize {
        4 * size
    }

    fn run(&self, input: &[f32], out: &mut [f32], scratch: &mut [f32]) {
        self.split(0, input, 1, out, scratch);
    }

    fn split(&self, level: usize, input: &[f32], stride: usize, out: &mut [f32], scratch: &mut [f32]) {
        let Some(twiddles) = self.twiddles.get(level) else {
            self.direct(input, stride, out);
            return;
        };
        let half = twiddles.len();
        let (even, rest) = scratch.split_at_mut(2 * half);
        let (odd, rest) = rest.split_at_mut(2 * half);
        self.split(level + 1, input, stride * 2, even, rest);
        self.split(level + 1, &input[stride..], stride * 2, odd, rest);
        for (k, &(re, im)) in twiddles.iter().enumerate() {
            let (re_odd, im_odd) = (odd[2 * k], odd[2 * k + 1]);
            let (re_even, im_even) = (even[2 * k], even[2 * k + 1]);
            out[2 * k] = re_even + re * re_odd - im * im_odd;
            out[2 * k + 1] = im_even + re * im_odd + im * re_odd;
            out[2 * (k + half)] = re_even - re * re_odd + im * im_odd;
            out[2 * (k + half) + 1] = im_even - re * im_odd - im * re_odd;
        }
    }

    fn direct(&self, input: &[f32], stride: usize, out: &mut [f32]) {
        for k in 0..self.dft_size {
            let mut re = 0.0;
            let mut im = 0.0;
            for j in 0..self.dft_size {
                let (cos, sin) = self.dft[k * self.dft_size + j];
                let sample = input[j * stride];
                re += sample * cos;
                im -= sample * sin;
            }
            out[2 * k] = re;
            out[2 * k + 1] = im;
        }
    }
}

fn frame_count(samples: usize) -> usize {
    samples.div_ceil(HOP * PADDING_FRAMES) * PADDING_FRAMES + PADDING_FRAMES
}

fn fill_window(pcm: &mut impl Read, window: &mut [f32]) -> io::Result<()> {
    let mut bytes = [0_u8; N_FFT * SAMPLE_BYTES];
    let bytes = &mut bytes[..window.len() * SAMPLE_BYTES];
    let mut filled = 0;
    while filled < bytes.len() {
        match pcm.read(&mut bytes[filled..]) {
            Ok(0) => break,
            Ok(read) => filled += read,
            Err(error) if error.kind() == io::ErrorKind::Interrupted => {}
            Err(error) => return Err(error),
        }
    }
    bytes[filled..].fill(0);
    let (raw, _) = bytes.as_chunks::<SAMPLE_BYTES>();
    for (sample, raw) in window.iter_mut().zip(raw) {
        *sample = f32::from_le_bytes(*raw);
    }
    Ok(())
}

fn mel_energy(power: &[f32], filter: &[f32]) -> f32 {
    let mut sum = 0.0;
    let mut k = 0;
    while k < N_FREQS - 3 {
        sum += power[k] * filter[k]
            + power[k + 1] * filter[k + 1]
            + power[k + 2] * filter[k + 2]
            + power[k + 3] * filter[k + 3];
        k += 4;
    }
    while k < N_FREQS {
        sum += power[k] * filter[k];
        k += 1;
    }
    sum
}

/// The spectrogram of `samples` little-endian `f32` samples read from `pcm`, as
/// `n_mel` rows of frames, padded with silence the way Whisper expects.
pub(crate) fn log_mel(pcm: impl Read, samples: usize, n_mel: usize) -> io::Result<Vec<f32>> {
    let filters = mel_filters(n_mel);
    let fft = Fft::new(N_FFT);
    let hann: Vec<f32> = (0..N_FFT)
        .map(|i| 0.5 * (1.0 - ((PI + PI) * i as f32 / N_FFT as f32).cos()))
        .collect();
    let frames = frame_count(samples);
    let mut mel = vec![0_f32; frames * n_mel];
    let mut pcm = BufReader::with_capacity(READ_BUFFER, pcm);
    let mut window = [0_f32; N_FFT];
    let mut windowed = [0_f32; N_FFT];
    let mut spectrum = vec![0_f32; 2 * N_FFT];
    let mut scratch = vec![0_f32; fft.scratch_len(N_FFT)];
    fill_window(&mut pcm, &mut window)?;
    for frame in 0..frames {
        for (shaped, (sample, weight)) in windowed.iter_mut().zip(window.iter().zip(&hann)) {
            *shaped = weight * sample;
        }
        fft.run(&windowed, &mut spectrum, &mut scratch);
        for j in 0..N_FFT {
            spectrum[j] = spectrum[2 * j] * spectrum[2 * j] + spectrum[2 * j + 1] * spectrum[2 * j + 1];
        }
        for j in 1..N_FFT / 2 {
            let mirrored = spectrum[N_FFT - j];
            spectrum[j] += mirrored;
        }
        for (band, filter) in filters.as_chunks::<N_FREQS>().0.iter().enumerate() {
            mel[band * frames + frame] = mel_energy(&spectrum, filter).max(1e-10).log10();
        }
        window.copy_within(HOP.., 0);
        fill_window(&mut pcm, &mut window[N_FFT - HOP..])?;
    }
    let floor = mel.iter().copied().fold(f32::NEG_INFINITY, f32::max) - 8.0;
    for value in &mut mel {
        *value = value.max(floor) / 4.0 + 1.0;
    }
    Ok(mel)
}

fn mel_filters(n_mels: usize) -> Vec<f32> {
    const SR: f64 = 16000.0;
    let n_freqs = N_FREQS;
    let f_sp = 200.0 / 3.0;
    let min_log_hz = 1000.0;
    let min_log_mel = min_log_hz / f_sp;
    let logstep = (6.4_f64).ln() / 27.0;
    let hz_to_mel = |hz: f64| {
        if hz >= min_log_hz {
            min_log_mel + (hz / min_log_hz).ln() / logstep
        } else {
            hz / f_sp
        }
    };
    let mel_to_hz = |mel: f64| {
        if mel >= min_log_mel {
            min_log_hz * (logstep * (mel - min_log_mel)).exp()
        } else {
            mel * f_sp
        }
    };
    let mel_min = hz_to_mel(0.0);
    let mel_max = hz_to_mel(SR / 2.0);
    let hz_pts: Vec<f64> = (0..n_mels + 2)
        .map(|i| mel_to_hz(mel_min + (mel_max - mel_min) * i as f64 / (n_mels + 1) as f64))
        .collect();
    let fft_freqs: Vec<f64> = (0..n_freqs)
        .map(|i| (SR / 2.0) * i as f64 / (n_freqs - 1) as f64)
        .collect();
    let mut weights = vec![0f32; n_mels * n_freqs];
    for m in 0..n_mels {
        let (lo, ce, hi) = (hz_pts[m], hz_pts[m + 1], hz_pts[m + 2]);
        let enorm = 2.0 / (hi - lo);
        for (k, &f) in fft_freqs.iter().enumerate() {
            let val = ((f - lo) / (ce - lo)).min((hi - f) / (hi - ce)).max(0.0) * enorm;
            weights[m * n_freqs + k] = val as f32;
        }
    }
    weights
}

#[cfg(test)]
mod tests {
    use candle_transformers::models::whisper::audio;

    use super::*;

    const N_MEL: usize = 80;

    fn tone(samples: usize) -> Vec<f32> {
        (0..samples)
            .map(|i| {
                let t = i as f32 / 16_000.0;
                0.4 * (2.0 * PI * 440.0 * t).sin() + 0.2 * (2.0 * PI * 1_750.0 * t).sin()
            })
            .collect()
    }

    fn as_bytes(samples: &[f32]) -> Vec<u8> {
        samples.iter().flat_map(|sample| sample.to_le_bytes()).collect()
    }

    fn candles_spectrogram(samples: &[f32]) -> Vec<f32> {
        let filters = mel_filters(N_MEL);
        audio::log_mel_spectrogram_(samples, &filters, N_FFT, HOP, N_MEL, false)
    }

    #[test]
    fn matches_candle_on_a_clip_shorter_than_a_chunk() {
        let samples = tone(12_345);

        let mel = log_mel(as_bytes(&samples).as_slice(), samples.len(), N_MEL).unwrap();

        assert_eq!(mel, candles_spectrogram(&samples));
    }

    #[test]
    fn matches_candle_on_a_clip_that_ends_on_a_frame_boundary() {
        let samples = tone(HOP * PADDING_FRAMES);

        let mel = log_mel(as_bytes(&samples).as_slice(), samples.len(), N_MEL).unwrap();

        assert_eq!(mel, candles_spectrogram(&samples));
    }

    #[test]
    fn pads_a_clip_with_one_chunk_of_silence_past_its_rounded_length() {
        assert_eq!(frame_count(0), PADDING_FRAMES);
        assert_eq!(frame_count(1), 2 * PADDING_FRAMES);
        assert_eq!(frame_count(HOP * PADDING_FRAMES), 2 * PADDING_FRAMES);
        assert_eq!(frame_count(HOP * PADDING_FRAMES + 1), 3 * PADDING_FRAMES);
    }

    #[test]
    fn reads_a_source_that_answers_a_few_bytes_at_a_time() {
        struct Trickle<'a>(&'a [u8]);

        impl Read for Trickle<'_> {
            fn read(&mut self, into: &mut [u8]) -> io::Result<usize> {
                let n = into.len().min(self.0.len()).min(3);
                into[..n].copy_from_slice(&self.0[..n]);
                self.0 = &self.0[n..];
                Ok(n)
            }
        }
        let samples = tone(4_000);
        let bytes = as_bytes(&samples);

        let mel = log_mel(Trickle(&bytes), samples.len(), N_MEL).unwrap();

        assert_eq!(mel, candles_spectrogram(&samples));
    }
}
