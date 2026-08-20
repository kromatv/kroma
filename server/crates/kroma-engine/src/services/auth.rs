//! Authentication primitives: password hashing and session tokens.
//!
//! PBKDF2-HMAC-SHA256 is hand-rolled on top of the `sha2` crate already in the
//! dependency tree, keeping the build lean. Randomness comes from
//! `/dev/urandom` (the server only ever runs on Unix: Linux NAS / macOS dev).

use sha2::{Digest, Sha256};

// OWASP's current recommendation for PBKDF2-HMAC-SHA256 in release builds;
// debug builds use a lighter factor so tests don't crawl. The count is stored
// in each hash, so changing it never invalidates existing ones.
const PBKDF2_ITERS: u32 = if cfg!(debug_assertions) { 20_000 } else { 600_000 };
const SALT_LEN: usize = 16;
const SHA256_BLOCK: usize = 64;
// Refreshed from the access token via `/auth/token` before this lapses.
pub const SESSION_TTL_SECS: i64 = 3600;
// Exchanged for session tokens; this is the credential a logout revokes.
pub const ACCESS_TTL_SECS: i64 = 90 * 24 * 3600;

// HMAC-SHA256 (RFC 2104) over `msg` keyed by `key`.
fn hmac_sha256(key: &[u8], msg: &[u8]) -> [u8; 32] {
    let mut k = [0u8; SHA256_BLOCK];
    if key.len() > SHA256_BLOCK {
        let mut h = Sha256::new();
        h.update(key);
        k[..32].copy_from_slice(&h.finalize());
    } else {
        k[..key.len()].copy_from_slice(key);
    }

    let mut ipad = [0x36u8; SHA256_BLOCK];
    let mut opad = [0x5cu8; SHA256_BLOCK];
    for i in 0..SHA256_BLOCK {
        ipad[i] ^= k[i];
        opad[i] ^= k[i];
    }

    let mut inner = Sha256::new();
    inner.update(ipad);
    inner.update(msg);
    let inner_digest = inner.finalize();

    let mut outer = Sha256::new();
    outer.update(opad);
    outer.update(inner_digest);

    let mut out = [0u8; 32];
    out.copy_from_slice(&outer.finalize());
    out
}

/// PBKDF2-HMAC-SHA256 producing a single 32-byte derived key (dkLen == hLen,
/// so exactly one block is needed; INT(i) is always `0x00000001`).
pub(crate) fn pbkdf2_sha256(password: &[u8], salt: &[u8], iters: u32) -> [u8; 32] {
    let mut block = Vec::with_capacity(salt.len() + 4);
    block.extend_from_slice(salt);
    block.extend_from_slice(&1u32.to_be_bytes());

    let mut u = hmac_sha256(password, &block);
    let mut out = u;
    for _ in 1..iters {
        u = hmac_sha256(password, &u);
        for i in 0..32 {
            out[i] ^= u[i];
        }
    }
    out
}

/// Constant-time byte comparison (avoids leaking the match prefix via timing).
pub(crate) fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for i in 0..a.len() {
        diff |= a[i] ^ b[i];
    }
    diff == 0
}

pub(crate) use kroma_primitives::random_bytes;
pub use kroma_primitives::{random_token, random_u32};

// 600k PBKDF2 iterations hold a thread for hundreds of ms and `/auth/login`
// reaches them without a session, so the worker's core is handed to another
// thread. `block_in_place` panics on a current-thread runtime, hence the flavour check.
fn without_blocking_the_runtime<T>(work: impl FnOnce() -> T) -> T {
    match tokio::runtime::Handle::try_current() {
        Ok(handle)
            if !matches!(handle.runtime_flavor(), tokio::runtime::RuntimeFlavor::CurrentThread) =>
        {
            tokio::task::block_in_place(work)
        }
        _ => work(),
    }
}

/// Hash a plaintext password to the storable form `pbkdf2$<iters>$<salt_hex>$<dk_hex>`.
/// Safe to call from an async task: the derivation runs off the runtime's worker.
pub fn hash_password(password: &str) -> String {
    let salt = random_bytes(SALT_LEN);
    let dk = without_blocking_the_runtime(|| pbkdf2_sha256(password.as_bytes(), &salt, PBKDF2_ITERS));
    format!("pbkdf2${PBKDF2_ITERS}${}${}", hex::encode(&salt), hex::encode(dk))
}

/// Verify `password` against a stored `pbkdf2$…` hash. Returns false on any
/// malformed hash. Safe to call from an async task: the derivation runs off the
/// runtime's worker.
pub fn verify_password(password: &str, stored: &str) -> bool {
    let mut parts = stored.split('$');
    if parts.next() != Some("pbkdf2") {
        return false;
    }
    let Some(iters) = parts.next().and_then(|s| s.parse::<u32>().ok()) else {
        return false;
    };
    let Some(salt) = parts.next().and_then(|s| hex::decode(s).ok()) else {
        return false;
    };
    let Some(expected) = parts.next().and_then(|s| hex::decode(s).ok()) else {
        return false;
    };
    let dk = without_blocking_the_runtime(|| pbkdf2_sha256(password.as_bytes(), &salt, iters));
    ct_eq(&dk, &expected)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pbkdf2_known_vector() {
        // RFC 6070-style vector for PBKDF2-HMAC-SHA256:
        // P="password", S="salt", c=1, dkLen=32.
        let dk = pbkdf2_sha256(b"password", b"salt", 1);
        assert_eq!(
            hex::encode(dk),
            "120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b"
        );
        // c=2 vector.
        let dk2 = pbkdf2_sha256(b"password", b"salt", 2);
        assert_eq!(
            hex::encode(dk2),
            "ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43"
        );
    }

    #[test]
    fn hmac_known_vector() {
        // RFC 4231 test case 2: key="Jefe", data="what do ya want for nothing?".
        let mac = hmac_sha256(b"Jefe", b"what do ya want for nothing?");
        assert_eq!(
            hex::encode(mac),
            "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"
        );
    }

    #[test]
    fn hash_round_trip() {
        let h = hash_password("s3cret!");
        assert!(h.starts_with("pbkdf2$"));
        assert!(verify_password("s3cret!", &h));
        assert!(!verify_password("wrong", &h));
        assert!(!verify_password("s3cret!", "garbage"));
    }

    #[test]
    fn a_key_longer_than_the_hmac_block_is_hashed_down_first() {
        let mac = hmac_sha256(&[0xaa; 131], b"Test Using Larger Than Block-Size Key - Hash Key First");
        assert_eq!(
            hex::encode(mac),
            "60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54"
        );
    }

    #[test]
    fn a_passphrase_longer_than_the_hmac_block_still_round_trips() {
        let long = "correct horse battery staple ".repeat(8);
        let stored = hash_password(&long);
        assert!(verify_password(&long, &stored));
        assert!(!verify_password(&long[..long.len() - 1], &stored));
    }

    #[test]
    fn a_stored_hash_broken_in_any_field_verifies_nothing() {
        for broken in [
            "",
            "scrypt$20000$00$00",
            "pbkdf2$many$00$00",
            "pbkdf2$20000$nothex$00",
            "pbkdf2$20000$00$nothex",
            "pbkdf2$20000$00",
        ] {
            assert!(!verify_password("s3cret!", broken), "{broken:?} must not authenticate");
        }
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 1)]
    async fn work_moved_off_the_runtime_lets_another_task_run_on_the_only_worker() {
        let (tx, rx) = std::sync::mpsc::channel::<u8>();

        let blocking = tokio::spawn(async move {
            without_blocking_the_runtime(move || rx.recv_timeout(std::time::Duration::from_secs(5)))
        });
        tokio::spawn(async move {
            let _ = tx.send(7);
        });

        assert_eq!(blocking.await.unwrap().ok(), Some(7));
    }

    #[tokio::test]
    async fn hashing_on_a_current_thread_runtime_still_round_trips() {
        let stored = hash_password("s3cret!");

        assert!(verify_password("s3cret!", &stored));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn hashing_inside_a_blocking_task_still_round_trips() {
        let stored = tokio::task::spawn_blocking(|| hash_password("s3cret!")).await.unwrap();

        assert!(tokio::task::spawn_blocking(move || verify_password("s3cret!", &stored)).await.unwrap());
    }

    #[test]
    fn tokens_are_unique_and_long() {
        let a = random_token();
        let b = random_token();
        assert_eq!(a.len(), 64);
        assert_ne!(a, b);
    }
}
