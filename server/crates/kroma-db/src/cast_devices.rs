//! The televisions an account has cast to, kept after they switch off so they
//! can be listed and brought back. One row per receiver id.

use rusqlite::OptionalExtension;

use super::{params, Pool, Result, Row};

/// The most televisions one account keeps. The oldest seen leaves first.
pub const MAX_CAST_DEVICES: i64 = 32;

const DEVICE_COLS: &str =
    "receiver_id, user_id, name, platform, mac, address, app_id, beside_server, seen_at";

/// A television as it last described itself.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CastDevice {
    pub receiver_id: String,
    pub user_id: String,
    pub name: String,
    pub platform: String,
    pub mac: Option<String>,
    pub address: Option<String>,
    pub app_id: Option<String>,
    /// Whether it reached the server from the server's own network.
    pub beside_server: bool,
    pub seen_at: i64,
}

fn row_to_device(r: &Row) -> rusqlite::Result<CastDevice> {
    Ok(CastDevice {
        receiver_id: r.get(0)?,
        user_id: r.get(1)?,
        name: r.get(2)?,
        platform: r.get(3)?,
        mac: r.get(4)?,
        address: r.get(5)?,
        app_id: r.get(6)?,
        beside_server: r.get(7)?,
        seen_at: r.get(8)?,
    })
}

/// Store a television, or refresh it. A receiver id that signs into another
/// account moves to that account: the set itself changed hands.
pub fn remember_cast_device(pool: &Pool, device: &CastDevice) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "INSERT INTO cast_devices \
         (receiver_id, user_id, name, platform, mac, address, app_id, beside_server, seen_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) \
         ON CONFLICT(receiver_id) DO UPDATE SET \
           user_id = ?2, name = ?3, platform = ?4, mac = ?5, address = ?6, app_id = ?7, \
           beside_server = ?8, seen_at = ?9",
        params![
            device.receiver_id,
            device.user_id,
            device.name,
            device.platform,
            device.mac,
            device.address,
            device.app_id,
            device.beside_server,
            device.seen_at
        ],
    )?;
    conn.execute(
        "DELETE FROM cast_devices WHERE user_id = ?1 AND receiver_id NOT IN \
         (SELECT receiver_id FROM cast_devices WHERE user_id = ?1 \
          ORDER BY seen_at DESC, receiver_id LIMIT ?2)",
        params![device.user_id, MAX_CAST_DEVICES],
    )?;
    Ok(())
}

/// Every television `user_id` keeps, by name.
pub fn cast_devices_for_user(pool: &Pool, user_id: &str) -> Result<Vec<CastDevice>> {
    let conn = pool.get()?;
    let sql = format!(
        "SELECT {DEVICE_COLS} FROM cast_devices WHERE user_id = ?1 ORDER BY name, receiver_id"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![user_id], row_to_device)?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

/// One television, only for the account that keeps it.
pub fn cast_device(pool: &Pool, receiver_id: &str, user_id: &str) -> Result<Option<CastDevice>> {
    let conn = pool.get()?;
    let sql = format!(
        "SELECT {DEVICE_COLS} FROM cast_devices WHERE receiver_id = ?1 AND user_id = ?2"
    );
    Ok(conn
        .query_row(&sql, params![receiver_id, user_id], row_to_device)
        .optional()?)
}

/// Drop a television. `false` when `user_id` keeps none by that id.
pub fn forget_cast_device(pool: &Pool, receiver_id: &str, user_id: &str) -> Result<bool> {
    let conn = pool.get()?;
    let gone = conn.execute(
        "DELETE FROM cast_devices WHERE receiver_id = ?1 AND user_id = ?2",
        params![receiver_id, user_id],
    )?;
    Ok(gone > 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::TempPool;

    fn pool() -> (TempPool, String, String) {
        let p = crate::testing::temp_pool("cast-devices");
        let a = crate::create_user(&p, "a@test.dev", "A", "h", &[])
            .unwrap()
            .id;
        let b = crate::create_user(&p, "b@test.dev", "B", "h", &[])
            .unwrap()
            .id;
        (p, a, b)
    }

    fn device(id: &str, user: &str, seen_at: i64) -> CastDevice {
        CastDevice {
            receiver_id: id.into(),
            user_id: user.into(),
            name: "Salon".into(),
            platform: "Tizen".into(),
            mac: Some("a0:b1:c2:d3:e4:f5".into()),
            address: Some("192.168.1.20".into()),
            app_id: Some("KromaTV001.Kroma".into()),
            beside_server: true,
            seen_at,
        }
    }

    #[test]
    fn a_remembered_television_reads_back_as_it_was_stored() {
        let (p, a, _) = pool();
        let salon = device("tv-salon-01", &a, 1_000);

        remember_cast_device(&p, &salon).unwrap();

        assert_eq!(cast_devices_for_user(&p, &a).unwrap(), vec![salon.clone()]);
        assert_eq!(cast_device(&p, "tv-salon-01", &a).unwrap(), Some(salon));
    }

    #[test]
    fn remembering_again_refreshes_the_same_row() {
        let (p, a, _) = pool();
        remember_cast_device(&p, &device("tv-salon-01", &a, 1_000)).unwrap();
        let renamed = CastDevice {
            name: "Chambre".into(),
            mac: None,
            ..device("tv-salon-01", &a, 2_000)
        };

        remember_cast_device(&p, &renamed).unwrap();

        assert_eq!(cast_devices_for_user(&p, &a).unwrap(), vec![renamed]);
    }

    #[test]
    fn another_account_neither_reads_nor_forgets_it() {
        let (p, a, b) = pool();
        remember_cast_device(&p, &device("tv-salon-01", &a, 1_000)).unwrap();

        assert!(cast_devices_for_user(&p, &b).unwrap().is_empty());
        assert_eq!(cast_device(&p, "tv-salon-01", &b).unwrap(), None);
        assert!(!forget_cast_device(&p, "tv-salon-01", &b).unwrap());
        assert!(forget_cast_device(&p, "tv-salon-01", &a).unwrap());
        assert!(cast_devices_for_user(&p, &a).unwrap().is_empty());
    }

    #[test]
    fn a_set_that_signs_into_another_account_moves_there() {
        let (p, a, b) = pool();
        remember_cast_device(&p, &device("tv-salon-01", &a, 1_000)).unwrap();

        remember_cast_device(&p, &device("tv-salon-01", &b, 2_000)).unwrap();

        assert!(cast_devices_for_user(&p, &a).unwrap().is_empty());
        assert_eq!(cast_devices_for_user(&p, &b).unwrap().len(), 1);
    }

    #[test]
    fn the_oldest_seen_leaves_when_an_account_keeps_too_many() {
        let (p, a, _) = pool();
        for n in 0..=MAX_CAST_DEVICES {
            remember_cast_device(&p, &device(&format!("tv-number-{n:02}"), &a, 1_000 + n))
                .unwrap();
        }

        let kept = cast_devices_for_user(&p, &a).unwrap();

        assert_eq!(kept.len(), usize::try_from(MAX_CAST_DEVICES).unwrap());
        assert!(kept.iter().all(|d| d.receiver_id != "tv-number-00"));
    }
}
